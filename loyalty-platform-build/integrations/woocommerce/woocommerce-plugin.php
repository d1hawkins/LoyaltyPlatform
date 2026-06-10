<?php
/**
 * Plugin Name: Loyalty Platform for WooCommerce
 * Description: Integrates the Loyalty Platform with WooCommerce — awards points on purchase and displays member balances.
 * Version: 0.1.0
 * Requires PHP: 7.4
 * Requires at least: 5.9
 * WC requires at least: 7.0
 *
 * @package LoyaltyPlatform
 */

defined('ABSPATH') || exit;

// ---- Settings ----

add_action('admin_menu', function () {
    add_options_page(
        'Loyalty Platform Settings',
        'Loyalty Platform',
        'manage_options',
        'loyalty-platform',
        'loyalty_platform_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('loyalty_platform', 'loyalty_api_url');
    register_setting('loyalty_platform', 'loyalty_api_key');
    register_setting('loyalty_platform', 'loyalty_tenant_id');
    register_setting('loyalty_platform', 'loyalty_sdk_cdn_url', [
        'default' => 'https://cdn.example.com/loyalty-sdk/latest/loyalty-sdk.umd.js',
    ]);
});

function loyalty_platform_settings_page(): void {
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>Loyalty Platform Settings</h1>
        <form method="post" action="options.php">
            <?php settings_fields('loyalty_platform'); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="loyalty_api_url">API URL</label></th>
                    <td><input type="url" id="loyalty_api_url" name="loyalty_api_url" value="<?php echo esc_attr(get_option('loyalty_api_url', '')); ?>" class="regular-text" /></td>
                </tr>
                <tr>
                    <th scope="row"><label for="loyalty_api_key">API Key</label></th>
                    <td><input type="password" id="loyalty_api_key" name="loyalty_api_key" value="<?php echo esc_attr(get_option('loyalty_api_key', '')); ?>" class="regular-text" /></td>
                </tr>
                <tr>
                    <th scope="row"><label for="loyalty_tenant_id">Tenant ID</label></th>
                    <td><input type="text" id="loyalty_tenant_id" name="loyalty_tenant_id" value="<?php echo esc_attr(get_option('loyalty_tenant_id', '')); ?>" class="regular-text" /></td>
                </tr>
                <tr>
                    <th scope="row"><label for="loyalty_sdk_cdn_url">SDK CDN URL</label></th>
                    <td><input type="url" id="loyalty_sdk_cdn_url" name="loyalty_sdk_cdn_url" value="<?php echo esc_attr(get_option('loyalty_sdk_cdn_url', 'https://cdn.example.com/loyalty-sdk/latest/loyalty-sdk.umd.js')); ?>" class="regular-text" /></td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

// ---- Loyalty API Client ----

function loyalty_platform_api_call(string $method, string $path, array $body = null): array {
    $api_url   = get_option('loyalty_api_url', '');
    $api_key   = get_option('loyalty_api_key', '');
    $tenant_id = get_option('loyalty_tenant_id', '');

    if (empty($api_url) || empty($api_key) || empty($tenant_id)) {
        return ['error' => 'Loyalty Platform not configured'];
    }

    $url = rtrim($api_url, '/') . $path;

    $headers = [
        'Authorization'             => 'Bearer ' . $api_key,
        'X-Tenant-ID'               => $tenant_id,
        'Ocp-Apim-Subscription-Key' => $api_key,
        'Content-Type'              => 'application/json',
    ];

    if ($method === 'POST') {
        $headers['Idempotency-Key'] = wp_generate_uuid4();
    }

    $args = [
        'method'  => $method,
        'headers' => $headers,
        'timeout' => 15,
    ];

    if ($body !== null) {
        $args['body'] = wp_json_encode($body);
    }

    $response = wp_remote_request($url, $args);

    if (is_wp_error($response)) {
        error_log('Loyalty Platform API error: ' . $response->get_error_message());
        return ['error' => $response->get_error_message()];
    }

    $status = wp_remote_retrieve_response_code($response);
    $decoded = json_decode(wp_remote_retrieve_body($response), true);

    if ($status >= 400) {
        $title = $decoded['title'] ?? 'API error';
        error_log("Loyalty Platform API {$status}: {$title}");
        return ['error' => $title, 'status' => $status];
    }

    return $decoded ?? [];
}

// ---- Award Points on Payment Complete ----

add_action('woocommerce_payment_complete', 'loyalty_platform_on_payment_complete');

function loyalty_platform_on_payment_complete(int $order_id): void {
    $order = wc_get_order($order_id);
    if (!$order) {
        return;
    }

    // Skip if already processed
    if ($order->get_meta('_loyalty_points_awarded')) {
        return;
    }

    $email = $order->get_billing_email();
    if (empty($email)) {
        return;
    }

    // 1. Lookup member by email
    $member = loyalty_platform_api_call('GET', '/member/v1/members?' . http_build_query(['email' => $email]));
    if (isset($member['error']) || empty($member['id'])) {
        error_log("Loyalty: No member found for email {$email} (order {$order_id})");
        return;
    }

    // 2. Build transaction data
    $amount_cents = (int) round((float) $order->get_total() * 100);
    $sku_list     = [];

    foreach ($order->get_items() as $item) {
        /** @var \WC_Order_Item_Product $item */
        $product = $item->get_product();
        $sku_list[] = [
            'sku'    => $product ? $product->get_sku() : 'woo-' . $item->get_product_id(),
            'amount' => (int) round((float) $item->get_total() * 100),
        ];
    }

    $txn_data = [
        'memberId'   => $member['id'],
        'channel'    => 'ecommerce',
        'amount'     => $amount_cents,
        'currency'   => $order->get_currency(),
        'skuList'    => $sku_list,
        'occurredAt' => $order->get_date_created()->format('c'),
    ];

    /**
     * Filter the transaction data before sending to the Loyalty Platform API.
     *
     * @param array    $txn_data Transaction data array.
     * @param WC_Order $order    The WooCommerce order.
     */
    $txn_data = apply_filters('loyalty_platform_transaction_data', $txn_data, $order);

    // 3. Record transaction
    $result = loyalty_platform_api_call('POST', '/engine/v1/transactions', $txn_data);

    if (isset($result['error'])) {
        error_log("Loyalty: Failed to record transaction for order {$order_id}: " . $result['error']);
        return;
    }

    // 4. Store result as order meta
    $order->update_meta_data('_loyalty_points_awarded', $result['pointsEarned'] ?? 0);
    $order->update_meta_data('_loyalty_transaction_id', $result['transactionId'] ?? '');
    $order->update_meta_data('_loyalty_new_balance', $result['newBalance'] ?? 0);
    $order->save();

    /**
     * Action fired after loyalty points are awarded for an order.
     *
     * @param int $order_id     WooCommerce order ID.
     * @param int $points_earned Points earned.
     * @param int $new_balance   New member points balance.
     */
    do_action(
        'loyalty_platform_points_awarded',
        $order_id,
        $result['pointsEarned'] ?? 0,
        $result['newBalance'] ?? 0
    );

    if (function_exists('wc_get_logger')) {
        wc_get_logger()->info(
            sprintf('Order %d: awarded %d points (balance: %d)', $order_id, $result['pointsEarned'] ?? 0, $result['newBalance'] ?? 0),
            ['source' => 'loyalty-platform']
        );
    }
}

// ---- Display Points on Order Admin Page ----

add_action('woocommerce_admin_order_data_after_billing_address', function ($order) {
    $points = $order->get_meta('_loyalty_points_awarded');
    if ($points) {
        echo '<p><strong>Loyalty Points Earned:</strong> ' . esc_html($points) . '</p>';
    }
});
