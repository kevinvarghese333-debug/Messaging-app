export interface User {
  id: string;
  name: string;
  handle: string;
  email: string;
  roleLevel: "ADMIN" | "DEPT_HEAD" | "MANAGER" | "MEMBER";
  active: boolean;
  departmentId: string | null;
  managerId: string | null;
  lastSeenAt: string | null;
  department?: { id: string; name: string } | null;
  manager?: { id: string; name: string } | null;
}

export interface Department {
  id: string;
  name: string;
  slug: string;
  headId: string | null;
  head?: { id: string; name: string; handle: string } | null;
  _count?: { users: number };
}

export interface Channel {
  id: string;
  name: string;
  type: "PUBLIC" | "PRIVATE" | "DM";
  departmentId: string | null;
  department?: { id: string; name: string } | null;
  isMember: boolean;
  unread: number;
  dmWith: { id: string; name: string; handle: string } | null;
  memberCount: number;
}

export interface Mention {
  id: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
}

export interface Message {
  id: string;
  channelId: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  author: { id: string; name: string; handle: string };
  mentions: Mention[];
  task: { id: string; status: string; title: string } | null;
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  _count: { replies: number };
}

export interface TaskAssignee {
  id: string;
  userId: string;
  via: "DIRECT" | "DEPARTMENT" | "ROLE_LEVEL";
  viaLabel: string | null;
  user: { id: string; name: string; handle: string; departmentId: string | null };
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  assignerId: string;
  assigner: { id: string; name: string; handle: string };
  assignees: TaskAssignee[];
  sourceMessage: { id: string; channelId: string; content: string } | null;
  meeting: { id: string; title: string; startsAt: string } | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface MeetingAttendee {
  id: string;
  userId: string;
  response: "PENDING" | "ACCEPTED" | "DECLINED";
  user: { id: string; name: string; handle: string };
}

export interface Meeting {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  location: string | null;
  organizerId: string;
  organizer: { id: string; name: string; handle: string };
  attendees: MeetingAttendee[];
  actionItems: Task[];
}

export interface MentionTarget {
  kind: "user" | "department" | "group";
  token: string;
  label: string;
}

export type AssignmentTarget =
  | { type: "USER"; id: string }
  | { type: "DEPARTMENT"; id: string }
  | { type: "ROLE_LEVEL"; level: string; departmentId?: string };
