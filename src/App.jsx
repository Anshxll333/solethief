import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Product from './pages/Product';
import Shop from './pages/Shop';
import NewDrops from './pages/NewDrops';
import About from './pages/About';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import Account from './pages/Account';
import Admin from './pages/Admin';
import CommerceProvider from './commerce/CommerceProvider';
import { AuthProvider } from './auth/AuthContext.jsx';
import AdminRoute from './auth/AdminRoute.jsx';
import { WishlistProvider } from './commerce/WishlistContext.jsx';
import SaveButtonAnimator from './components/SaveButtonAnimator.jsx';

function App() {
  return (
    <AuthProvider>
      <CommerceProvider>
        <WishlistProvider>
          <SaveButtonAnimator />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/new-drops" element={<NewDrops />} />
            <Route path="/about" element={<About />} />
            <Route path="/product/:id/images" element={<Product imagesOnly />} />
            <Route path="/product/:id" element={<Product />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order-confirmation/:orderId" element={<OrderConfirmation />} />
            <Route path="/account" element={<Account />} />
            <Route path="/login" element={<Account initialView="signin" />} />
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          </Routes>
        </WishlistProvider>
      </CommerceProvider>
    </AuthProvider>
  );
}

export default App;
