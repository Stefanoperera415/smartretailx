import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { CartContext } from "../context/CartContext";
import * as orderService from "../services/orderService";
import * as paymentService from "../services/paymentService";
import { formatCurrency } from "../utils/format";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const COUNTRIES = [
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IN", name: "India" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "JP", name: "Japan" },
  { code: "CN", name: "China" },
  { code: "KR", name: "South Korea" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "IE", name: "Ireland" },
  { code: "PT", name: "Portugal" },
  { code: "GR", name: "Greece" },
  { code: "PL", name: "Poland" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "ZA", name: "South Africa" },
];

const CheckoutForm = ({
  clientSecret,
  orderId,
  customerId,
  cartItems,
  cartTotal,
  shippingAddress,
  onSuccess,
  onError,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: {
            name: customerId,
            address: {
              country: shippingAddress.countryCode,
              city: shippingAddress.city || undefined,
              postal_code: shippingAddress.postalCode || undefined,
              line1: shippingAddress.street || undefined,
            },
          },
        },
      });

      if (error) {
        onError(error.message);
      } else if (paymentIntent.status === "succeeded") {
        // ✅ Now includes productName so notification-service can render
        //    "Your 'iPhone 15' will be delivered shortly."
        await paymentService.confirmPayment({
          paymentIntentId: paymentIntent.id,
          orderId,
          customerId,
          amount: cartTotal,
          currency: "GBP",
          items: cartItems.map((item) => ({
            productId: item.productId,
            productName: item.name,       // ✅ NEW
            quantity: item.quantity,
          })),
        });
        onSuccess(orderId);
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border border-gray-200 rounded-lg p-4">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "16px",
                color: "#1a202c",
                "::placeholder": { color: "#a0aec0" },
              },
            },
          }}
        />
      </div>
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="btn-primary w-full"
      >
        {isProcessing ? "Processing payment..." : `Pay ${formatCurrency(cartTotal, "GBP")}`}
      </button>
    </form>
  );
};

const CheckoutPage = () => {
  const { user } = useContext(AuthContext);
  const { cartItems, cartTotal, clearCart } = useContext(CartContext);
  const [shippingAddress, setShippingAddress] = useState({
    street: "",
    city: "",
    postalCode: "",
    country: "",
    countryCode: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const navigate = useNavigate();

  const handleCountryChange = (e) => {
    const code = e.target.value;
    const selected = COUNTRIES.find((c) => c.code === code);
    setShippingAddress((prev) => ({
      ...prev,
      country: selected ? selected.name : "",
      countryCode: selected ? selected.code : "",
    }));
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate("/login");
      return;
    }
    if (!shippingAddress.country || !shippingAddress.countryCode) {
      setError("Please select a country.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const orderData = {
        customerId: user.id,
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        shippingAddress: {
          street: shippingAddress.street,
          city: shippingAddress.city,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country,
          countryCode: shippingAddress.countryCode,
        },
        currency: "GBP",
      };
      const orderRes = await orderService.createOrder(orderData);
      const order = orderRes.data.data;
      setOrderId(order.orderId);

      const paymentIntentRes = await paymentService.createPaymentIntent({
        orderId: order.orderId,
        customerId: user.id,
        amount: cartTotal,
        currency: "GBP",
      });
      setClientSecret(paymentIntentRes.data.clientSecret);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to initiate payment. Please try again.");
      setLoading(false);
    }
  };

  const handlePaymentSuccess = (orderId) => {
    clearCart();
    navigate(`/payment/success?orderId=${orderId}`);
  };

  const handlePaymentError = (message) => {
    setError(`Payment failed: ${message}`);
    navigate(`/payment/failure?reason=${encodeURIComponent(message)}`);
  };

  if (clientSecret) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Complete Payment</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Order Summary</h2>
          {cartItems.map((item) => (
            <div key={item.productId} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
              <span className="text-gray-700">
                {item.name} × {item.quantity}
              </span>
              <span className="font-medium">{formatCurrency(item.price * item.quantity, item.currency)}</span>
            </div>
          ))}
          <div className="border-t border-gray-200 pt-2 mt-2 font-bold text-gray-800">
            Total: {formatCurrency(cartTotal, "GBP")}
          </div>
        </div>
        <Elements stripe={stripePromise}>
          <CheckoutForm
            clientSecret={clientSecret}
            orderId={orderId}
            customerId={user.id}
            cartItems={cartItems}
            cartTotal={cartTotal}
            shippingAddress={shippingAddress}
            onSuccess={handlePaymentSuccess}
            onError={handlePaymentError}
          />
        </Elements>
        {error && <div className="mt-4 bg-red-50 text-red-700 p-3 rounded-lg border border-red-200">{error}</div>}
        <button
          onClick={() => setClientSecret(null)}
          className="mt-4 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to address
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Checkout</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Order Summary</h2>
        {cartItems.map((item) => (
          <div key={item.productId} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
            <span className="text-gray-700">
              {item.name} × {item.quantity}
            </span>
            <span className="font-medium">{formatCurrency(item.price * item.quantity, item.currency)}</span>
          </div>
        ))}
        <div className="border-t border-gray-200 pt-2 mt-2 font-bold text-gray-800">
          Total: {formatCurrency(cartTotal, "GBP")}
        </div>
      </div>

      <form onSubmit={handlePlaceOrder} className="bg-white rounded-xl shadow-sm border border-gray-100/80 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Shipping Address</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Street</label>
          <input
            type="text"
            value={shippingAddress.street}
            onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })}
            required
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input
            type="text"
            value={shippingAddress.city}
            onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
            required
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
          <input
            type="text"
            value={shippingAddress.postalCode}
            onChange={(e) => setShippingAddress({ ...shippingAddress, postalCode: e.target.value })}
            required
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
          <select
            value={shippingAddress.countryCode}
            onChange={handleCountryChange}
            required
            className="input-field"
          >
            <option value="">Select a country</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Processing..." : "Proceed to Payment"}
        </button>
      </form>
    </div>
  );
};

export default CheckoutPage;