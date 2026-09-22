import { Link } from "react-router-dom";

const Dashboard = () => {
  const links = [
    { to: "/admin/products", label: "Products", desc: "Manage product catalog" },
    { to: "/admin/categories", label: "Categories", desc: "Manage product categories" }, 
      { to: "/admin/warehouses", label: "Warehouses", desc: "Manage warehouses" }, 
    { to: "/admin/orders", label: "Orders", desc: "View and update orders" },
    { to: "/admin/inventory", label: "Inventory", desc: "Manage stock levels" },
    { to: "/admin/users", label: "Users", desc: "Manage user accounts" },
    { to: "/admin/notifications", label: "Notifications", desc: "View notifications" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {links.map(({ to, label, desc }) => (
          <Link
            key={to}
            to={to}
            className="bg-white rounded-xl shadow-sm border border-gray-100/80 p-6 hover:shadow-lg hover:border-indigo-200 transition-all duration-300"
          >
            <h2 className="text-lg font-semibold text-gray-800">{label}</h2>
            <p className="text-sm text-gray-500 mt-1">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;