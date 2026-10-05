import {
  AdminCreateUserRequest,
  AdminUpdateUserRequest,
  AdminUserView,
} from "@common/types/accounts";
import { apiClient } from "../lib/apiClient";

export async function listUsers(): Promise<AdminUserView[]> {
  const { data } = await apiClient.get<{ success: boolean; users: AdminUserView[] }>(
    "/api/admin/users",
  );
  return data.users;
}

export async function createUser(payload: AdminCreateUserRequest): Promise<AdminUserView> {
  const { data } = await apiClient.post<{ success: boolean; user: AdminUserView }>(
    "/api/admin/users",
    payload,
  );
  return data.user;
}

export async function updateUser(
  id: string,
  payload: AdminUpdateUserRequest,
): Promise<AdminUserView> {
  const { data } = await apiClient.patch<{ success: boolean; user: AdminUserView }>(
    `/api/admin/users/${id}`,
    payload,
  );
  return data.user;
}
