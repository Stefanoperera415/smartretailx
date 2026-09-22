import { formatCurrency } from "../utils/format";
import { CartContext } from "../context/CartContext";
import { useContext } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";

const CartItem = ({ item }) => {
  const { updateQuantity, removeItem } = useContext(CartContext);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 border-b border-gray-100 last:border-0 gap-4">
      <div className="flex items-center space-x-4">
        <div className="h-16 w-16 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-gray-400 text-xs">No img</div>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-800">{item.name}</p>
          <p className="text-sm text-gray-500">{formatCurrency(item.price, item.currency)}</p>
        </div>
      </div>
      <div className="flex items-center space-x-4 ml-auto sm:ml-0">
        <div className="flex items-center border border-gray-300 rounded-lg">
          <button
            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
            className="px-2 py-1 hover:bg-gray-100 rounded-l-lg"
          >
            -
          </button>
          <span className="px-3 py-1 min-w-[2rem] text-center">{item.quantity}</span>
          <button
            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
            className="px-2 py-1 hover:bg-gray-100 rounded-r-lg"
          >
            +
          </button>
        </div>
        <span className="font-bold text-gray-800 w-20 text-right">
          {formatCurrency(item.price * item.quantity, item.currency)}
        </span>
        <button
          onClick={() => removeItem(item.productId)}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default CartItem;