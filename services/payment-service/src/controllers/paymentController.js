const paymentRepository = require("../repositories/paymentRepository");
const outboxRepo = require("../repositories/outboxRepository");
const database = require("../config/database");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

function generatePaymentId() {
  const suffix = Math.random().toString(36).substring(2, 6);
  return `PAY${Date.now()}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Read endpoints
// ---------------------------------------------------------------------------

async function getPayments(req, res) {
  try {
    const payments = await paymentRepository.findAll();
    return res.status(200).json({ data: payments });
  } catch (error) {
    console.error("Get payments error:", error);
    return res.status(500).json({ error: "Failed to retrieve payments" });
  }
}

async function getPaymentById(req, res) {
  try {
    const payment = await paymentRepository.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    return res.status(200).json({ data: payment });
  } catch (error) {
    console.error("Get payment error:", error);
    return res.status(500).json({ error: "Failed to retrieve payment" });
  }
}

async function getPaymentsByOrder(req, res) {
  try {
    const payments = await paymentRepository.findByOrderId(req.params.orderId);
    return res.status(200).json({ data: payments });
  } catch (error) {
    console.error("Get order payments error:", error);
    return res.status(500).json({ error: "Failed to retrieve payments" });
  }
}

// ---------------------------------------------------------------------------
// Create PaymentIntent
// ---------------------------------------------------------------------------

/**
 * Create a Stripe PaymentIntent.
 *
 * ✅ Also stores the order's items in a staging table so the webhook (which
 *    only sees PaymentIntent metadata) can include product names in the
 *    resulting PaymentCompleted event.
 */
async function createPaymentIntent(req, res) {
  try {
    const {
      orderId,
      customerId,
      amount,
      currency = "GBP",
      items = [],
      warehouseId,
      warehouseMapping,
    } = req.body;

    if (!orderId || !customerId || !amount) {
      return res
        .status(400)
        .json({ error: "orderId, customerId and amount are required" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      metadata: { orderId, customerId }, // items not in metadata — too large
    });

    // ✅ Stash the items so the webhook can retrieve them later
    await paymentRepository.stageIntentItems(paymentIntent.id, {
      orderId,
      customerId,
      items: Array.isArray(items) ? items : [],
      warehouseId: warehouseId || null,
      warehouseMapping: warehouseMapping || null,
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Create PaymentIntent error:", error);
    return res.status(500).json({ error: "Failed to create payment intent" });
  }
}

// ---------------------------------------------------------------------------
// Confirm Payment (frontend fast-path)
// ---------------------------------------------------------------------------

async function confirmPayment(req, res) {
  try {
    const {
      paymentIntentId,
      orderId,
      customerId,
      amount,
      currency,
      items = [],
      warehouseId,
      warehouseMapping,
    } = req.body;

    if (!paymentIntentId || !orderId || !customerId || !amount) {
      return res.status(400).json({
        error:
          "paymentIntentId, orderId, customerId and amount are required",
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ error: "Payment not successful" });
    }

    // Idempotent — webhook may have run first
    const existing = await paymentRepository.findByTransactionRef(paymentIntentId);
    if (existing) {
      return res.status(200).json({
        message: "Payment already confirmed",
        payment: existing,
      });
    }

    const payment = {
      paymentId: generatePaymentId(),
      orderId,
      customerId,
      amount,
      currency: currency || "GBP",
      status: "COMPLETED",
      provider: "STRIPE",
      transactionRef: paymentIntentId,
    };

    const eventId = `pay-complete-${paymentIntentId}`;
    await paymentRepository.create(payment, async (client) => {
      await outboxRepo.enqueue(client, eventId, "PaymentCompleted", {
        orderId,
        customerId,
        amount,
        currency: currency || "GBP",
        items: Array.isArray(items) ? items : [],
        warehouseId: warehouseId || null,
        warehouseMapping: warehouseMapping || null,
        transactionRef: paymentIntentId,
      });
    });

    // Clean up the staged intent data now that payment is recorded
    await paymentRepository.clearStagedIntent(paymentIntentId).catch(() => {});

    return res.status(200).json({
      message: "Payment confirmed successfully",
      payment,
    });
  } catch (error) {
    console.error("Confirm payment error:", error);
    return res.status(500).json({ error: "Failed to confirm payment" });
  }
}

// ---------------------------------------------------------------------------
// Stripe Webhook (authoritative backstop)
// ---------------------------------------------------------------------------

async function handleStripeWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("STRIPE_WEBHOOK_SECRET not set — webhook disabled");
    return res.status(501).end();
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Claim the event. `false` means it's already been seen.
  const firstTime = await paymentRepository.recordStripeEvent(
    event.id,
    event.type
  );
  if (!firstTime) {
    console.log(`Stripe webhook duplicate ignored: ${event.id}`);
    return res.json({ received: true });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      await onPaymentIntentSucceeded(event.data.object);
    } else if (event.type === "payment_intent.payment_failed") {
      await onPaymentIntentFailed(event.data.object);
    }
    return res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    // ✅ CRITICAL: roll back the dedup marker so Stripe's retry will
    //    re-process this event rather than silently dropping it.
    await paymentRepository.deleteStripeEvent(event.id).catch((e) => {
      console.error(`Could not clear stripe_events row ${event.id}:`, e.message);
    });
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}

async function onPaymentIntentSucceeded(pi) {
  const { orderId, customerId } = pi.metadata || {};
  if (!orderId || !customerId) {
    console.warn("PaymentIntent missing metadata", pi.id);
    return;
  }

  // If the frontend already confirmed, skip
  const existing = await paymentRepository.findByTransactionRef(pi.id);
  if (existing) {
    console.log(`Webhook: payment already recorded for ${pi.id}`);
    return;
  }

  // ✅ Recover items that were stashed at create-payment-intent time
  const staged = await paymentRepository.getStagedIntent(pi.id);

  const payment = {
    paymentId: generatePaymentId(),
    orderId,
    customerId,
    amount: pi.amount_received / 100,
    currency: (pi.currency || "gbp").toUpperCase(),
    status: "COMPLETED",
    provider: "STRIPE",
    transactionRef: pi.id,
  };

  const eventId = `pay-complete-${pi.id}`;
  await paymentRepository.create(payment, async (client) => {
    await outboxRepo.enqueue(client, eventId, "PaymentCompleted", {
      orderId,
      customerId,
      amount: payment.amount,
      currency: payment.currency,
      items: staged?.items || [],
      warehouseId: staged?.warehouseId || null,
      warehouseMapping: staged?.warehouseMapping || null,
      transactionRef: pi.id,
      source: "stripe-webhook",
    });
  });

  // Cleanup
  await paymentRepository.clearStagedIntent(pi.id).catch(() => {});
  console.log(`Webhook: PaymentCompleted queued for ${orderId}`);
}

async function onPaymentIntentFailed(pi) {
  const { orderId, customerId } = pi.metadata || {};
  if (!orderId) return;

  const staged = await paymentRepository.getStagedIntent(pi.id);
  const eventId = `pay-fail-${pi.id}`;

  const pool = database.pool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await outboxRepo.enqueue(client, eventId, "PaymentFailed", {
      orderId,
      customerId,
      amount: pi.amount / 100,
      currency: (pi.currency || "gbp").toUpperCase(),
      items: staged?.items || [],
      warehouseId: staged?.warehouseId || null,
      warehouseMapping: staged?.warehouseMapping || null,
      reason: pi.last_payment_error?.message || "Payment failed",
      transactionRef: pi.id,
      source: "stripe-webhook",
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await paymentRepository.clearStagedIntent(pi.id).catch(() => {});
  console.log(`Webhook: PaymentFailed queued for ${orderId}`);
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

async function refundPayment(req, res) {
  try {
    const payment = await paymentRepository.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (payment.status !== "COMPLETED") {
      return res
        .status(409)
        .json({ error: "Only completed payments can be refunded" });
    }

    let stripeRefundId = null;
    if (payment.provider === "STRIPE" && payment.transaction_ref) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: payment.transaction_ref,
        });
        stripeRefundId = refund.id;
      } catch (err) {
        console.error("Stripe refund failed:", err.message);
        return res
          .status(502)
          .json({ error: `Stripe refund failed: ${err.message}` });
      }
    }

    const refundedPayment = await paymentRepository.updateStatus(
      payment.payment_id,
      "REFUNDED",
      stripeRefundId ? `refund:${stripeRefundId}` : null
    );

    return res.status(200).json({
      message: "Payment refunded successfully",
      data: refundedPayment,
    });
  } catch (error) {
    console.error("Refund payment error:", error);
    return res.status(500).json({ error: "Failed to refund payment" });
  }
}

module.exports = {
  getPayments,
  getPaymentById,
  getPaymentsByOrder,
  createPaymentIntent,
  confirmPayment,
  handleStripeWebhook,
  refundPayment,
};