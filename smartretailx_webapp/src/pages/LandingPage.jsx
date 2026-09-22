import { useEffect, useState, useContext } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowRightIcon,
  BoltIcon,
  ShieldCheckIcon,
  TruckIcon,
  SparklesIcon,
  StarIcon,
  GlobeAltIcon,
  CubeIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import * as productService from "../services/productService";
import { formatCurrency } from "../utils/format";
import { AuthContext } from "../context/AuthContext";
import LoadingSpinner from "../components/LoadingSpinner";

const FEATURES = [
  {
    icon: BoltIcon,
    title: "Lightning-fast delivery",
    desc: "Orders dispatched from the warehouse closest to you. Most arrive in 2–3 days.",
    accent: "from-indigo-500 to-violet-500",
  },
  {
    icon: ShieldCheckIcon,
    title: "Secure by design",
    desc: "Bank-grade encryption, OAuth 2.0 sign-in, and fraud protection on every order.",
    accent: "from-emerald-500 to-teal-500",
  },
  {
    icon: TruckIcon,
    title: "Free returns",
    desc: "Changed your mind? Send it back within 30 days, no questions asked.",
    accent: "from-orange-500 to-amber-500",
  },
  {
    icon: GlobeAltIcon,
    title: "Global reach",
    desc: "Ships to over 30 countries with real-time tracking on every package.",
    accent: "from-pink-500 to-rose-500",
  },
];

const STATS = [
  { value: "50K+", label: "Happy customers" },
  { value: "10K+", label: "Products listed" },
  { value: "30+", label: "Countries served" },
  { value: "99.9%", label: "Uptime" },
];

const TESTIMONIALS = [
  {
    quote:
      "The fastest checkout I've ever used. I had my order in under 60 seconds, and it arrived two days later.",
    name: "Amaya Perera",
    role: "Product Designer",
    avatar: "AP",
  },
  {
    quote:
      "SmartRetailX is my go-to. The product photos are accurate, prices are fair, and returns are painless.",
    name: "Marcus Chen",
    role: "Software Engineer",
    avatar: "MC",
  },
  {
    quote:
      "Honestly didn't expect this level of polish from a smaller store. It feels like shopping on a premium app.",
    name: "Sofia Rossi",
    role: "Marketing Lead",
    avatar: "SR",
  },
];

const LandingPage = () => {
  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Auth state — so we can redirect logged-in users away from the landing page
  const { user, loading: authLoading } = useContext(AuthContext);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          productService.getAllProducts(),
          productService.getCategories(),
        ]);
        const active = (productsRes.data.data || []).filter(
          (p) => p.status === "ACTIVE"
        );
        setFeatured(active.slice(0, 3));
        setCategories((categoriesRes.data.data || []).slice(0, 6));
      } catch (err) {
        console.error("Landing fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // ✅ While auth is resolving, show a spinner (avoids a flash of the landing page)
  if (authLoading) return <LoadingSpinner />;

  // ✅ If the user is already logged in, skip the marketing page entirely
  if (user) return <Navigate to="/shop" replace />;

  return (
    <div className="overflow-x-hidden">
      {/* ============ HERO ============ */}
      <section className="relative pt-10 pb-24 lg:pt-16 lg:pb-32">
        {/* background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-32 h-[32rem] w-[32rem] rounded-full bg-gradient-to-br from-indigo-300/40 via-violet-300/40 to-pink-300/40 blur-3xl" />
          <div className="absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-cyan-300/30 via-blue-300/30 to-indigo-300/30 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgb(15 23 42) 1px, transparent 0)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: copy */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white/70 backdrop-blur px-3.5 py-1.5 text-xs font-medium text-indigo-700 shadow-sm">
              <SparklesIcon className="h-4 w-4" />
              New — SmartRetailX Autumn Collection
            </div>

            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
              Shop smarter.
              <br />
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                Live better.
              </span>
            </h1>

            <p className="mt-6 text-lg text-slate-600 max-w-xl leading-relaxed">
              Thousands of carefully curated products, delivered fast. Sign in
              with Google or Facebook, checkout in seconds, and track every
              order in real time.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/shop"
                className="group inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/30 transition-all duration-200"
              >
                Browse the catalog
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/80 backdrop-blur px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-white hover:border-slate-400 transition-all duration-200"
              >
                Create free account
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[
                    "bg-indigo-500",
                    "bg-violet-500",
                    "bg-pink-500",
                    "bg-emerald-500",
                  ].map((c, i) => (
                    <div
                      key={i}
                      className={`h-7 w-7 rounded-full ${c} ring-2 ring-white`}
                    />
                  ))}
                </div>
                <span>
                  Loved by{" "}
                  <strong className="text-slate-700">50,000+</strong> shoppers
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <StarIcon
                    key={i}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                  />
                ))}
                <span className="ml-1">4.9 / 5</span>
              </div>
            </div>
          </div>

          {/* Right: product preview card */}
          <div className="relative">
            <div className="relative mx-auto max-w-md">
              <div className="absolute -top-6 -left-6 h-32 w-32 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-2xl opacity-90" />
              <div className="absolute -bottom-8 -right-4 h-40 w-40 rounded-full bg-gradient-to-br from-pink-400 to-amber-400 shadow-2xl opacity-80 blur-sm" />

              <div className="relative rounded-3xl border border-slate-200/80 bg-white/90 backdrop-blur shadow-2xl shadow-indigo-500/10 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                      Featured today
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      New arrivals
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  {loading ? (
                    [1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-14 rounded-xl bg-slate-100 animate-pulse"
                      />
                    ))
                  ) : featured.length > 0 ? (
                    featured.map((p) => (
                      <Link
                        key={p.productId}
                        to={`/product/${p.productId}`}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-2.5 hover:border-indigo-200 hover:shadow-md transition-all"
                      >
                        <div className="h-10 w-10 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {p.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatCurrency(p.price, p.currency)}
                          </p>
                        </div>
                        <ArrowRightIcon className="h-4 w-4 text-slate-400" />
                      </Link>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                      No products yet
                    </div>
                  )}
                </div>

                <Link
                  to="/shop"
                  className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  View all products
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ TRUST STRIP ============ */}
      <section className="border-y border-slate-200/70 py-6">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-slate-500">
          {[
            "Free shipping over £50",
            "30-day returns",
            "Secure payments",
            "24/7 support",
          ].map((t) => (
            <span key={t} className="flex items-center gap-2">
              <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section className="py-20">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
            Why SmartRetailX
          </p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900">
            Shopping the way it should be
          </h2>
          <p className="mt-4 text-slate-600">
            Everything you'd expect from a modern store, engineered end to end.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group relative rounded-2xl border border-slate-200/80 bg-white p-6 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/60 hover:border-slate-300 transition-all duration-300"
            >
              <div
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.accent} text-white shadow-lg`}
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-slate-900">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ CATEGORIES ============ */}
      {categories.length > 0 && (
        <section className="py-16">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
                Shop by category
              </p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">
                Find exactly what you need
              </h2>
            </div>
            <Link
              to="/shop"
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
            >
              See all products
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map((c) => (
              <Link
                key={c.categoryId}
                to="/shop"
                className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-5 hover:border-indigo-200 hover:shadow-lg transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <CubeIcon className="h-5 w-5" />
                </div>
                <p className="mt-4 font-semibold text-slate-900 truncate">
                  {c.name}
                </p>
                <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                  {c.description || "Explore products"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ============ STATS ============ */}
      <section className="py-20">
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-14 sm:px-14">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />

          <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-8 text-white">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  {s.value}
                </p>
                <p className="mt-2 text-sm text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      <section className="py-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
            Loved by shoppers
          </p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900">
            Real people. Real reviews.
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl border border-slate-200/80 bg-white p-6 hover:shadow-xl hover:-translate-y-1 transition-all"
            >
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <StarIcon
                    key={i}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                  />
                ))}
              </div>
              <p className="mt-4 text-slate-700 leading-relaxed">
                "{t.quote}"
              </p>
              <div className="mt-6 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-sm font-semibold text-white">
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {t.name}
                  </p>
                  <p className="text-xs text-slate-500">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="pb-24 pt-10">
        <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-8 py-16 sm:px-16 text-center">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full bg-indigo-300/40 blur-3xl" />

          <div className="relative max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 backdrop-blur px-3.5 py-1.5 text-xs font-medium text-indigo-700">
              <SparklesIcon className="h-4 w-4" />
              Start shopping today
            </div>
            <h2 className="mt-6 text-3xl sm:text-4xl font-bold text-slate-900">
              Your next favorite thing is one click away
            </h2>
            <p className="mt-4 text-slate-600">
              Join thousands of shoppers who've made SmartRetailX their
              everyday store.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/shop"
                className="group inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-800 transition-all"
              >
                Start shopping
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-all"
              >
                Sign up free
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;