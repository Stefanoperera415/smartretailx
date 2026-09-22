import { useContext } from "react";
import { Link } from "react-router-dom";
import { CartContext } from "../context/CartContext";
import CartItem from "../components/CartItem";
import { formatCurrency } from "../utils/format";

const CartPage = () => {
  const { cartItems, cartTotal, cartCount } = useContext(CartContext);

  if (cartItems.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <h2 className="text-2xl font-semibold text-gray-700">Your cart is empty</h2>
        <p className="text-gray-500 mt-2">Browse our products and add items you like.</p>
        <Link to="/" className="btn-primary mt-6 inline-block">Continue Shopping</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Shopping Cart</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 p-6">
        {cartItems.map(item => (
          <CartItem key={item.productId} item={item} />
        ))}
        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-gray-200 pt-6">
          <p className="text-lg font-semibold text-gray-800">
            Total ({cartCount} items): <span className="text-indigo-600">{formatCurrency(cartTotal, 'GBP')}</span>
          </p>
          <Link to="/checkout" className="btn-primary w-full sm:w-auto">Proceed to Checkout</Link>
        </div>
      </div>
    </div>
  );
};

export default CartPage;