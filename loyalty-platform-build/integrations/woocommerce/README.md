# WooCommerce Integration Guide

Integrate the Loyalty Platform with your WooCommerce store to award points on purchases and display member balances.

## Prerequisites

- A Loyalty Platform tenant with an active API subscription key
- WordPress site with WooCommerce installed
- PHP 7.4+

## Plugin Installation

1. Copy `woocommerce-plugin.php` and `woocommerce-widget.php` to `wp-content/plugins/loyalty-platform/`
2. Activate the plugin in **WordPress Admin > Plugins**
3. Navigate to **Settings > Loyalty Platform** and configure:
   - **API URL**: Your APIM gateway URL (e.g., `https://loyalty-dev-apim-xxx.azure-api.net`)
   - **API Key**: Your APIM subscription key
   - **Tenant ID**: Your tenant identifier

## Features

### Automatic Points on Purchase

When an order is marked as paid (`woocommerce_payment_complete`), the plugin:
1. Looks up the customer by email in the Loyalty Platform
2. Records the transaction with the order total and line items
3. Stores the points earned as order meta for reference

### Balance Display Widget

Use the `[loyalty_balance]` shortcode to display the logged-in customer's points balance anywhere in your theme:

```
[loyalty_balance]
```

The shortcode renders a container that loads the JS SDK and displays the balance widget.

### Balance in My Account

The plugin adds a "Loyalty Points" tab to the WooCommerce My Account page showing the customer's current balance and recent ledger entries.

## Architecture

```
WooCommerce
  |
  |-- woocommerce_payment_complete hook
  |       |
  |       +--> PHP REST call to Loyalty Platform API (recordTransaction)
  |
  |-- [loyalty_balance] shortcode
  |       |
  |       +--> Loads loyalty-sdk.umd.js
  |       +--> Renders balance widget via JS SDK
  |
  |-- My Account tab
          |
          +--> PHP REST call to get balance + ledger
```

## Shortcode Options

```
[loyalty_balance width="300px" show_offers="true"]
```

| Option | Default | Description |
|---|---|---|
| `width` | `100%` | Widget container width |
| `show_offers` | `false` | Also display eligible offers |

## Hooks and Filters

The plugin provides these hooks for customization:

```php
// Modify the transaction data before sending to the API
add_filter('loyalty_platform_transaction_data', function($data, $order) {
    // Add a location ID based on your store
    $data['locationId'] = 'store-main';
    return $data;
}, 10, 2);

// Action fired after points are awarded
add_action('loyalty_platform_points_awarded', function($order_id, $points_earned, $new_balance) {
    // e.g., send a custom email
}, 10, 3);
```

## Troubleshooting

- **No points awarded**: Check that the customer email matches an enrolled loyalty member
- **Plugin settings not saving**: Ensure the user has `manage_options` capability
- **Widget not loading**: Verify the CDN URL for the JS SDK bundle is correct
- **API errors**: Check the WordPress debug log (`wp-content/debug.log`)

## Support

For API documentation, see the [SDK README](/packages/loyalty-js-sdk/README.md).
