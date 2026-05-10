/**
 * 会话列表项数据结构
 * status 与协议层 SessionStatus 对齐
 */
export interface SessionItem {
  id: string;
  name: string;
  memberCount: number;
  activeMemberCount: number;
  lastActiveAt: string;
  status: 'active' | 'paused' | 'closed';
}

/**
 * 成员状态数据结构
 * status 与协议层 AgentStatus 对齐
 */
export interface SessionMember {
  id: string;
  name: string;
  role: string;
  duty?: string;
  status: 'online' | 'idle' | 'busy' | 'paused' | 'offline';
  lastHeartbeatAt: string;
  currentTask?: string;
  avatarColor?: string;
}

/**
 * 心跳记录数据结构
 */
export interface HeartbeatRecord {
  memberName: string;
  timestamp: string;
  status: 'ok' | 'warning' | 'late';
}

/**
 * 会话详情数据结构
 */
export interface SessionDetail {
  session: SessionItem;
  members: SessionMember[];
  recentHeartbeats: HeartbeatRecord[];
}
