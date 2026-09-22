import { useEffect, useState, useContext } from "react";
import { useParams } from "react-router-dom";
import * as productService from "../services/productService";
import { CartContext } from "../context/CartContext";
import LoadingSpinner from "../components/LoadingSpinner";
import { formatCurrency } from "../utils/format";

const ProductDetailPage = () => {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useContext(CartContext);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch product + categories in parallel
        const [productRes, categoriesRes] = await Promise.all([
          productService.getProductById(productId),
          productService.getCategories(),
        ]);

        const prod = productRes.data.data;
        setProduct(prod);

        const cat = (categoriesRes.data.data || []).find(
          (c) => c.categoryId === prod.categoryId
        );
        setCategoryName(cat ? cat.name : "");
      } catch (err) {
        console.error("Failed to load product", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [productId]);

  if (loading) return <LoadingSpinner />;
  if (!product) return <div className="text-center py-12">Product not found.</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white rounded-xl shadow-sm p-6 md:p-8 border border-gray-100/80">
        <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-gray-400">No image</span>
          )}
        </div>
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold text-gray-800">{product.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Category: {categoryName || product.categoryId}
          </p>
          <p className="text-gray-600 mt-4 leading-relaxed">{product.description}</p>
          <p className="text-2xl font-bold text-indigo-600 mt-4">
            {formatCurrency(product.price, product.currency)}
          </p>
          <div className="flex items-center mt-6 space-x-4">
            <label className="text-sm font-medium text-gray-700">Quantity</label>
            <div className="flex items-center border border-gray-300 rounded-lg">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="px-3 py-1 hover:bg-gray-100 rounded-l-lg"
              >
                -
              </button>
              <span className="px-4 py-1 border-x border-gray-300 w-12 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="px-3 py-1 hover:bg-gray-100 rounded-r-lg"
              >
                +
              </button>
            </div>
          </div>
          <button
            onClick={() => addToCart(product, quantity)}
            className="btn-primary mt-6 w-full md:w-auto"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailPage;