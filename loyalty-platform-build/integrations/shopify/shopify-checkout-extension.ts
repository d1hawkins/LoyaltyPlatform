/**
 * Shopify Checkout Extension Scaffold — Loyalty Offer Redemption
 *
 * This is a scaffold for a Shopify Functions discount extension that
 * applies loyalty offer redemptions at checkout.
 *
 * To use this:
 * 1. Create a Shopify app with `shopify app init`
 * 2. Add a discount function extension with `shopify app generate extension`
 * 3. Adapt this scaffold into the generated function entry point
 *
 * The extension communicates with the Loyalty Platform API to:
 * - Validate the member's identity (via email)
 * - Check eligible offers
 * - Apply a redemption discount
 *
 * NOTE: Shopify Functions run in a sandboxed WASM environment and cannot
 * make HTTP calls directly. The pattern below uses Shopify's cart transform
 * or discount function input (metafields) to pass loyalty data that was
 * pre-fetched by a storefront app proxy or cart attributes.
 */

// ---- Types (Shopify Functions input/output) ----

interface CartInput {
  cart: {
    buyerIdentity?: {
      email?: string;
    };
    attribute?: Array<{
      key: string;
      value: string;
    }>;
    lines: Array<{
      id: string;
      quantity: number;
      cost: {
        totalAmount: {
          amount: string;
          currencyCode: string;
        };
      };
    }>;
  };
}

interface FunctionResult {
  discountApplicationStrategy: 'FIRST' | 'MAXIMUM';
  discounts: Array<{
    message: string;
    targets: Array<{
      orderSubtotal: {
        excludedVariantIds: string[];
      };
    }>;
    value: {
      fixedAmount?: { amount: string };
      percentage?: { value: string };
    };
  }>;
}

// ---- Discount Function ----

/**
 * Shopify discount function entry point.
 *
 * Reads loyalty redemption data from cart attributes (pre-populated
 * by the storefront via the JS SDK) and returns a discount.
 */
export function run(input: CartInput): FunctionResult {
  const EMPTY_RESULT: FunctionResult = {
    discountApplicationStrategy: 'FIRST',
    discounts: [],
  };

  const attributes = input.cart.attribute ?? [];

  // Look for loyalty redemption attributes set by the storefront JS SDK
  const loyaltyRedemptionAttr = attributes.find((a) => a.key === '_loyalty_redemption');
  if (!loyaltyRedemptionAttr) {
    return EMPTY_RESULT;
  }

  let redemption: {
    offerId: string;
    offerName: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    redemptionId: string;
  };

  try {
    redemption = JSON.parse(loyaltyRedemptionAttr.value);
  } catch {
    return EMPTY_RESULT;
  }

  // Apply the loyalty discount
  if (redemption.discountType === 'percent') {
    return {
      discountApplicationStrategy: 'FIRST',
      discounts: [
        {
          message: `Loyalty: ${redemption.offerName}`,
          targets: [{ orderSubtotal: { excludedVariantIds: [] } }],
          value: {
            percentage: { value: String(redemption.discountValue) },
          },
        },
      ],
    };
  }

  // Fixed amount discount
  return {
    discountApplicationStrategy: 'FIRST',
    discounts: [
      {
        message: `Loyalty: ${redemption.offerName}`,
        targets: [{ orderSubtotal: { excludedVariantIds: [] } }],
        value: {
          fixedAmount: { amount: String(redemption.discountValue / 100) },
        },
      },
    ],
  };
}
