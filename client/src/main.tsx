import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import HomePage from "./routes/HomePage";
import ChecklistPage from "./routes/ChecklistPage";
import EditorPage from "./routes/EditorPage";

const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/aircraft/new", element: <EditorPage /> },
  { path: "/aircraft/:id", element: <ChecklistPage /> },
  { path: "/aircraft/:id/edit", element: <EditorPage /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
