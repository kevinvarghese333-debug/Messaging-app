import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./state/AuthContext";
import LoginPage from "./pages/LoginPage";
import Shell from "./pages/Shell";
import ChannelPage from "./pages/ChannelPage";
import TasksPage from "./pages/TasksPage";
import MeetingsPage from "./pages/MeetingsPage";
import AdminPage from "./pages/AdminPage";
import SearchPage from "./pages/SearchPage";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-full items-center justify-center text-slate-400">Loading…</div>;
  }
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<Shell />}>
        <Route index element={<Navigate to="/tasks" replace />} />
        <Route path="channels/:channelId" element={<ChannelPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
      </Route>
    </Routes>
  );
}
