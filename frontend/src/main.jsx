import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./context/AuthContext.jsx";
import MainApp from "./pages/MainApp.jsx";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  </React.StrictMode>
);