import { useSearchParams, Link } from "react-router-dom";
import { BellIcon } from "@heroicons/react/24/outline";

const PaymentSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="text-green-500 text-6xl mb-4">✓</div>
      <h1 className="text-3xl font-bold mb-4">Payment Successful!</h1>
      {orderId && <p className="text-gray-600 mb-2">Order ID: {orderId}</p>}
      <p className="text-gray-600">
        Thank you for your purchase. We'll send you updates as your order is
        processed.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <Link to="/notifications" className="btn-primary inline-flex items-center gap-2">
          <BellIcon className="h-4 w-4" />
          View notifications
        </Link>
        <Link to="/shop" className="btn-secondary">
          Continue shopping
        </Link>
      </div>
    </div>
  );
};

export default PaymentSuccessPage;