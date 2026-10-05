import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { IRootState } from '../../store/store';

export const PublicRoute = () => {
  const { user, accessToken } = useSelector((state: IRootState) => state.user);

  // If already logged in, redirect to home
  if (user && accessToken) {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
};