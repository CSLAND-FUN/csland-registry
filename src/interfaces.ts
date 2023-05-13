export interface ServerInfo {
  name: string;
  admins: AdminInfo[];
}

export interface AdminInfo {
  server: string;
  nick: string;
  profile: string;
  id: string;

  pushed: boolean;
  alerted_to_delete: boolean;
}
