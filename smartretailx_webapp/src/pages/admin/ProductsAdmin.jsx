import { useEffect, useState } from "react";
import * as productService from "../../services/productService";
import * as inventoryService from "../../services/inventoryService"; // ✅ new
import LoadingSpinner from "../../components/LoadingSpinner";
import { formatCurrency } from "../../utils/format";

const ProductsAdmin = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]); // ✅ new
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    categoryId: "",
    description: "",
    price: "",
    currency: "GBP",
    status: "ACTIVE",
    warehouseId: "", // ✅ new
    initialStock: 0, // ✅ new
  });
  const [image, setImage] = useState(null);

  const fetchProducts = async () => {
    try {
      const res = await productService.getAllProducts();
      setProducts(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await productService.getCategories();
      setCategories(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  };

  // ✅ Fetch warehouses
  const fetchWarehouses = async () => {
    try {
      const res = await inventoryService.getWarehouses();
      setWarehouses(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch warehouses:", err);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchWarehouses();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formDataToSend = new FormData();
    Object.entries(formData).forEach(([key, value]) => formDataToSend.append(key, value));
    if (image) formDataToSend.append("image", image);
    try {
      if (editingProduct) {
        await productService.updateProduct(editingProduct.productId, formDataToSend);
      } else {
        await productService.createProduct(formDataToSend);
      }
      setShowForm(false);
      setEditingProduct(null);
      resetForm();
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert("Failed to save product");
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      categoryId: product.categoryId,
      description: product.description,
      price: product.price,
      currency: product.currency,
      status: product.status,
      warehouseId: "", // for editing, we don't allow changing warehouse
      initialStock: 0,
    });
    setImage(null);
    setShowForm(true);
  };

  const handleDelete = async (productId) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      try {
        await productService.deleteProduct(productId);
        fetchProducts();
      } catch (err) {
        console.error(err);
        alert("Failed to delete product");
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      categoryId: "",
      description: "",
      price: "",
      currency: "GBP",
      status: "ACTIVE",
      warehouseId: "",
      initialStock: 0,
    });
    setImage(null);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage Products</h1>
        <button
          onClick={() => { setShowForm(!showForm); resetForm(); setEditingProduct(null); }}
          className="btn-primary"
        >
          {showForm ? "Cancel" : "Add Product"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100/80 p-6 mb-8 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">{editingProduct ? "Edit Product" : "New Product"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({...formData, categoryId: e.target.value})}
                required
                className="input-field"
              >
                <option value="">Select a category</option>
                {categories.map((cat) => (
                  <option key={cat.categoryId} value={cat.categoryId}>
                    {cat.name} ({cat.categoryId})
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required className="input-field" rows="3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
              <input type="number" step="0.01" min="0" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} required className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <input type="text" value={formData.currency} onChange={(e) => setFormData({...formData, currency: e.target.value})} required className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} className="input-field">
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
              <input type="file" onChange={(e) => setImage(e.target.files[0])} className="input-field" accept="image/*" />
            </div>

            {/* ✅ Warehouse dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
              <select
                value={formData.warehouseId}
                onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                className="input-field"
                disabled={!!editingProduct} // disable on edit
              >
                <option value="">Select warehouse</option>
                {warehouses.map((wh) => (
                  <option key={wh.warehouseId} value={wh.warehouseId}>
                    {wh.name} ({wh.warehouseId})
                  </option>
                ))}
              </select>
              {editingProduct && <p className="text-xs text-gray-400 mt-1">Warehouse cannot be changed after creation.</p>}
            </div>

            {/* ✅ Initial Stock */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Initial Stock</label>
              <input
                type="number"
                min="0"
                value={formData.initialStock}
                onChange={(e) => setFormData({ ...formData, initialStock: e.target.value })}
                className="input-field"
                disabled={!!editingProduct}
              />
              {editingProduct && <p className="text-xs text-gray-400 mt-1">Stock is managed in Inventory.</p>}
            </div>
          </div>
          <button type="submit" className="btn-primary">{editingProduct ? "Update" : "Create"}</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.map(product => (
                <tr key={product.productId}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 shrink-0 bg-gray-100 rounded-md overflow-hidden mr-3">
                        {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-gray-400">-</span>}
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">{product.name}</div>
                        <div className="text-sm text-gray-500">{product.productId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-800 font-medium">{formatCurrency(product.price, product.currency)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                      product.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {product.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button onClick={() => handleEdit(product)} className="text-indigo-600 hover:text-indigo-900 mr-3">Edit</button>
                    <button onClick={() => handleDelete(product.productId)} className="text-red-600 hover:text-red-900">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductsAdmin;