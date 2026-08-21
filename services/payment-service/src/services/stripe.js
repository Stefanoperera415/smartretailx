require("dotenv").config();
const Stripe = require("stripe");

// Use mock if STRIPE_SECRET_KEY is not set or USE_STRIPE=false
const USE_STRIPE = process.env.USE_STRIPE === "true" && process.env.STRIPE_SECRET_KEY;
let stripe = null;
if (USE_STRIPE) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-02-24.acacia", // use latest stable
  });
  console.log("Stripe initialized in LIVE/TEST mode");
} else {
  console.log("Using MOCK payment processor (no Stripe)");
}

/**
 * Process a payment.
 * Returns { success: boolean, transactionRef?: string, reason?: string }
 */
async function processPayment({ orderId, customerId, amount, currency, items, warehouseId }) {
  // --- Mock mode ---
  if (!USE_STRIPE) {
    // Simulate success/failure based on amount (same as before)
    const success = amount < 10000;
    return {
      success,
      transactionRef: success ? `MOCK-TXN-${Date.now()}` : null,
      reason: success ? undefined : "Mock payment declined (amount >= 10000)",
    };
  }

  // --- Stripe mode ---
  try {
    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // cents
      currency: currency.toLowerCase(),
      payment_method_types: ["card"],
      metadata: {
        orderId,
        customerId,
        warehouseId: warehouseId || "WH01",
      },
      // For test, we can use a test card. We'll let the client confirm later,
      // but we can also use `confirm: true` with a test payment method.
      // To keep it simple, we create it and then confirm with a test payment method.
      // Alternatively, we can set `payment_method` if we have one.
    });

    // In a real-world scenario, you would confirm the payment with a payment method.
    // For this prototype, we'll simulate confirmation by using a test card.
    // We'll use Stripe's test payment method IDs for success or failure.
    // We decide success/failure based on amount (same rule) but also attach a test card.
    const shouldSucceed = amount < 10000;
    const paymentMethod = shouldSucceed ? "pm_card_visa" : "pm_card_chargeDeclined";

    // Confirm the PaymentIntent with the test payment method
    const confirmedIntent = await stripe.paymentIntents.confirm(paymentIntent.id, {
      payment_method: paymentMethod,
    });

    if (confirmedIntent.status === "succeeded") {
      return {
        success: true,
        transactionRef: confirmedIntent.id,
      };
    } else {
      return {
        success: false,
        transactionRef: confirmedIntent.id,
        reason: `Stripe payment failed: ${confirmedIntent.status} - ${confirmedIntent.last_payment_error?.message || "Unknown error"}`,
      };
    }
  } catch (error) {
    console.error("Stripe error:", error);
    return {
      success: false,
      transactionRef: null,
      reason: error.message || "Stripe processing error",
    };
  }
}

module.exports = { processPayment };