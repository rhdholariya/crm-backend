export class AuthUser {
  id: number;
  email: string;
  roleId: number;
  role?: string; // role name e.g. 'Admin', 'User', 'Agent'
}
