import { useSearchParams } from "react-router-dom";

const PaymentFailurePage = () => {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get("reason");

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="text-red-500 text-6xl mb-4">✗</div>
      <h1 className="text-3xl font-bold mb-4">Payment Failed</h1>
      {reason && <p className="text-gray-600 mb-2">Reason: {reason}</p>}
      <p className="text-gray-600">Please try again or contact support.</p>
    </div>
  );
};

export default PaymentFailurePage;