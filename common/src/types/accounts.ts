export interface User{
    id: string;
    name: string;
    username: string;
    email: string;
    isAdmin?: boolean;
    createdAt?: string; //ISO String
}

// Admin user-management (server-gated to the ADMIN_EMAIL account).
export interface AdminUserView {
    id: string;
    username: string;
    email: string;
    active: boolean;
    isAdmin: boolean;
    createdAt?: string;
}

export interface AdminCreateUserRequest {
    username: string;
    email: string;
    password: string;
}

export interface AdminUpdateUserRequest {
    username?: string;
    email?: string;
    password?: string;
    active?: boolean;
}

export interface LoginUserRequest{
    email: string;
    password: string;
}

export interface LoginUserResponse {
    success: boolean;
    jwtToken: string;
    jwtRefreshToken: string;
    user: User;
    message?: string;
}

export interface CreateUserRequest {
    username: string;
    email: string;
    password: string;
    createdAt?: string; //ISO String
}

export interface CreateUserResponse {
    userId: string;
    success: boolean;
    jwtToken: string;
    jwtRefreshToken: string;
    user: User;
    message?: string;
}