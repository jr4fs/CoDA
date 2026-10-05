import { Navigate, Outlet } from "react-router-dom";
import { useSelector } from "react-redux";
import { IRootState } from "../../store/store";
import { isTokenExpired } from "../../lib/auth";

// UX gate for the hidden /admin route. Real authorization is enforced server-side
// (every /api/admin call requires the token's email === ADMIN_EMAIL), so a
// non-admin who forces the route sees nothing useful — the API returns 403.
export const AdminRoute = () => {
  const { user, accessToken } = useSelector((state: IRootState) => state.user);

  if (!accessToken || isTokenExpired(accessToken)) {
    return <Navigate to="/login" replace />;
  }
  if (!user?.isAdmin) {
    return <Navigate to="/home" replace />;
  }
  return <Outlet />;
};
