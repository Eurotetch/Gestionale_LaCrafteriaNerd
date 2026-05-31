import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/App.css";
import { AuthProvider } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoginPage from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import Customers from "@/pages/Customers";
import Products from "@/pages/Products";
import Inventory from "@/pages/Inventory";
import Invoices from "@/pages/Invoices";
import CalendarPage from "@/pages/Calendar";
import POSPage from "@/pages/POS";
import Reports from "@/pages/Reports";
import Users from "@/pages/Users";
import { Toaster } from "@/components/ui/sonner";

const wrap = (el, opts = {}) => (
  <ProtectedRoute {...opts}><Layout>{el}</Layout></ProtectedRoute>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage/>} />
          <Route path="/" element={wrap(<Dashboard/>)} />
          <Route path="/ordini" element={wrap(<Orders/>, { module: "orders" })} />
          <Route path="/clienti" element={wrap(<Customers/>, { module: "customers" })} />
          <Route path="/prodotti" element={wrap(<Products/>, { module: "products" })} />
          <Route path="/magazzino" element={wrap(<Inventory/>, { module: "inventory" })} />
          <Route path="/fatture" element={wrap(<Invoices/>, { module: "invoices" })} />
          <Route path="/calendario" element={wrap(<CalendarPage/>, { module: "calendar" })} />
          <Route path="/cassa" element={wrap(<POSPage/>, { module: "pos" })} />
          <Route path="/report" element={wrap(<Reports/>, { module: "reports" })} />
          <Route path="/utenti" element={wrap(<Users/>, { adminOnly: true })} />
          <Route path="*" element={wrap(<Dashboard/>)} />
        </Routes>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}
