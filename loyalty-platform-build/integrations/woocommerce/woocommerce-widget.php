<?php
/**
 * Loyalty Platform WooCommerce Widget
 *
 * Provides the [loyalty_balance] shortcode that renders the points balance
 * widget for the logged-in customer using the JavaScript SDK.
 *
 * @package LoyaltyPlatform
 */

defined('ABSPATH') || exit;

// ---- Shortcode: [loyalty_balance] ----

add_shortcode('loyalty_balance', 'loyalty_platform_balance_shortcode');

/**
 * Renders the loyalty points balance widget.
 *
 * Usage:
 *   [loyalty_balance]
 *   [loyalty_balance width="300px" show_offers="true"]
 *
 * @param array|string $atts Shortcode attributes.
 * @return string HTML output.
 */
function loyalty_platform_balance_shortcode($atts): string {
    $atts = shortcode_atts([
        'width'       => '100%',
        'show_offers' => 'false',
    ], $atts, 'loyalty_balance');

    // Must be logged in
    if (!is_user_logged_in()) {
        return '<p>Please <a href="' . esc_url(wp_login_url(get_permalink())) . '">log in</a> to view your loyalty balance.</p>';
    }

    $api_url   = esc_attr(get_option('loyalty_api_url', ''));
    $api_key   = esc_attr(get_option('loyalty_api_key', ''));
    $tenant_id = esc_attr(get_option('loyalty_tenant_id', ''));
    $cdn_url   = esc_url(get_option('loyalty_sdk_cdn_url', 'https://cdn.example.com/loyalty-sdk/latest/loyalty-sdk.umd.js'));

    if (empty($api_url) || empty($api_key) || empty($tenant_id)) {
        return '<!-- Loyalty Platform not configured -->';
    }

    $current_user = wp_get_current_user();
    $email        = esc_js($current_user->user_email);
    $width        = esc_attr($atts['width']);
    $show_offers  = $atts['show_offers'] === 'true';

    $container_id = 'loyalty-balance-' . wp_unique_id();
    $offers_id    = 'loyalty-offers-' . wp_unique_id();

    $html = '<div id="' . $container_id . '" style="max-width:' . $width . ';margin:16px 0;"></div>';
    if ($show_offers) {
        $html .= '<div id="' . $offers_id . '" style="max-width:' . $width . ';margin:16px 0;"></div>';
    }

    // Enqueue the SDK script once
    static $script_enqueued = false;
    if (!$script_enqueued) {
        wp_enqueue_script('loyalty-sdk', $cdn_url, [], null, true);
        $script_enqueued = true;
    }

    $offers_js = '';
    if ($show_offers) {
        $offers_js = "
            var offersEl = document.getElementById('" . esc_js($offers_id) . "');
            if (offersEl) {
                LoyaltySDK.renderOffersWidget(offersEl, client, member.id);
            }
        ";
    }

    $html .= "
    <script>
    (function() {
        function init() {
            if (typeof LoyaltySDK === 'undefined') {
                setTimeout(init, 100);
                return;
            }

            var client = new LoyaltySDK.LoyaltyClient({
                apiUrl: '{$api_url}',
                apiKey: '{$api_key}',
                tenantId: '{$tenant_id}'
            });

            client.lookupByEmail('{$email}').then(function(member) {
                if (!member) {
                    document.getElementById('{$container_id}').innerHTML =
                        '<p style=\"color:#718096;font-size:14px;\">You are not enrolled in our loyalty program yet.</p>';
                    return;
                }

                LoyaltySDK.renderBalanceWidget(
                    document.getElementById('" . esc_js($container_id) . "'),
                    client,
                    member.id
                );
                {$offers_js}
            }).catch(function(err) {
                console.error('Loyalty widget error:', err);
            });
        }

        if (document.readyState === 'complete') {
            init();
        } else {
            window.addEventListener('load', init);
        }
    })();
    </script>";

    return $html;
}

// ---- My Account Tab ----

add_filter('woocommerce_account_menu_items', function (array $items): array {
    // Insert before 'customer-logout'
    $new_items = [];
    foreach ($items as $key => $label) {
        if ($key === 'customer-logout') {
            $new_items['loyalty-points'] = 'Loyalty Points';
        }
        $new_items[$key] = $label;
    }
    return $new_items;
});

add_action('init', function () {
    add_rewrite_endpoint('loyalty-points', EP_ROOT | EP_PAGES);
});

add_action('woocommerce_account_loyalty-points_endpoint', function () {
    $api_url   = esc_attr(get_option('loyalty_api_url', ''));
    $api_key   = esc_attr(get_option('loyalty_api_key', ''));
    $tenant_id = esc_attr(get_option('loyalty_tenant_id', ''));
    $cdn_url   = esc_url(get_option('loyalty_sdk_cdn_url', 'https://cdn.example.com/loyalty-sdk/latest/loyalty-sdk.umd.js'));

    if (empty($api_url) || empty($api_key) || empty($tenant_id)) {
        echo '<p>Loyalty program is not configured. Please contact the store administrator.</p>';
        return;
    }

    $current_user = wp_get_current_user();
    $email        = esc_js($current_user->user_email);

    wp_enqueue_script('loyalty-sdk', $cdn_url, [], null, true);

    echo '<h2>Your Loyalty Points</h2>';
    echo '<div id="loyalty-myaccount-balance" style="margin:16px 0;"></div>';
    echo '<div id="loyalty-myaccount-offers" style="margin:16px 0;"></div>';
    echo '<div id="loyalty-myaccount-tier" style="margin:16px 0;"></div>';

    echo "
    <script>
    (function() {
        function init() {
            if (typeof LoyaltySDK === 'undefined') {
                setTimeout(init, 100);
                return;
            }

            var client = new LoyaltySDK.LoyaltyClient({
                apiUrl: '{$api_url}',
                apiKey: '{$api_key}',
                tenantId: '{$tenant_id}'
            });

            client.lookupByEmail('{$email}').then(function(member) {
                if (!member) {
                    document.getElementById('loyalty-myaccount-balance').innerHTML =
                        '<p>You are not enrolled in our loyalty program. Contact us to join!</p>';
                    return;
                }

                LoyaltySDK.renderBalanceWidget(document.getElementById('loyalty-myaccount-balance'), client, member.id);
                LoyaltySDK.renderTierProgressWidget(document.getElementById('loyalty-myaccount-tier'), client, member.id);
                LoyaltySDK.renderOffersWidget(document.getElementById('loyalty-myaccount-offers'), client, member.id);
            }).catch(function(err) {
                console.error('Loyalty widget error:', err);
                document.getElementById('loyalty-myaccount-balance').innerHTML =
                    '<p style=\"color:red;\">Unable to load loyalty information. Please try again later.</p>';
            });
        }

        if (document.readyState === 'complete') {
            init();
        } else {
            window.addEventListener('load', init);
        }
    })();
    </script>";
});
