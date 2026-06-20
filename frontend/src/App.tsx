import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Board from "./pages/Board";
import Stock from "./pages/Stock";
import Insider from "./pages/Insider";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Board />} />
        <Route path="/stock/:ticker" element={<Stock />} />
        <Route path="/insider/:cik" element={<Insider />} />
      </Routes>
    </Layout>
  );
}
