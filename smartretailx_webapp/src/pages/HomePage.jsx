import { useEffect, useState } from "react";
import ProductCard from "../components/ProductCard";
import LoadingSpinner from "../components/LoadingSpinner";
import * as productService from "../services/productService";

const HomePage = () => {
  const [products, setProducts] = useState([]);
  const [categoryMap, setCategoryMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch products and categories in parallel
        const [productsRes, categoriesRes] = await Promise.all([
          productService.getAllProducts(),
          productService.getCategories(),
        ]);

        setProducts(productsRes.data.data);

        // Build { categoryId: name } lookup
        const map = {};
        (categoriesRes.data.data || []).forEach((cat) => {
          map[cat.categoryId] = cat.name;
        });
        setCategoryMap(map);
      } catch (err) {
        setError("Failed to load products. Please try again. " + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-center text-red-600 py-12">{error}</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Our Products</h1>
      {products.length === 0 ? (
        <p className="text-gray-500">No products available.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.productId}
              product={product}
              categoryName={categoryMap[product.categoryId]}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HomePage;