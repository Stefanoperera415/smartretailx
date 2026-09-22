import { Link } from "react-router-dom";
import { formatCurrency } from "../utils/format";

const ProductCard = ({ product, categoryName }) => {
  return (
    <Link
      to={`/product/${product.productId}`}
      className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100/80 hover:border-indigo-200 overflow-hidden flex flex-col"
    >
      <div className="relative h-48 bg-gray-100 overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm">No image</div>
        )}
        <span className={`absolute top-3 right-3 px-2.5 py-0.5 text-xs font-semibold rounded-full ${
          product.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {product.status}
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-gray-800 truncate">{product.name}</h3>
        <p className="text-sm text-gray-500 mt-1">{categoryName || product.categoryId}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold text-indigo-600">
            {formatCurrency(product.price, product.currency)}
          </span>
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;