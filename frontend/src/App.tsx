import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Board from "./pages/Board";
import Stock from "./pages/Stock";
import Insider from "./pages/Insider";
import TopBuys from "./pages/TopBuys";
import SmartMoney from "./pages/SmartMoney";
import Strategy from "./pages/Strategy";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Board />} />
        <Route path="/stock/:ticker" element={<Stock />} />
        <Route path="/insider/:cik" element={<Insider />} />
        <Route path="/top-buys" element={<TopBuys />} />
        <Route path="/smart-money" element={<SmartMoney />} />
        <Route path="/strategy" element={<Strategy />} />
      </Routes>
    </Layout>
  );
}
