export interface DaktelaStatus {
  name: string;
  title: string;
}

export interface DaktelaAgent {
  name: string;
  title: string;
  extension?: string;
}

export interface DaktelaQueue {
  name: number;
  title: string;
}

export interface DaktelaContact {
  name: string;
  title: string;
  firstname?: string;
  lastname?: string;
  account?: {
    name: string;
    title: string;
  };
}

export interface DaktelaCallItem {
  id_call: string;
  call_time: string;
  direction: string;
  answered: boolean;
  clid?: string;
  id_queue?: DaktelaQueue;
  id_agent?: DaktelaAgent;
}

export interface DaktelaActivity {
  name: string;
  title: string;
  type: "CALL" | "EMAIL" | "CHAT" | "CUSTOM";
  action: string;
  time: string;
  duration: number;
  statuses: DaktelaStatus[];
  item?: DaktelaCallItem;
  contact?: DaktelaContact;
}

export interface DaktelaActivitiesResponse {
  error: unknown[];
  result: {
    data: DaktelaActivity[];
    total: number;
  };
}

export interface MappedCallRecord {
  callId: string;
  activityName: string;
  callTime: string;
  duration: number;
  direction: string | null;
  answered: boolean | null;
  clid: string | null;
  agentName: string | null;
  agentUsername: string | null;
  agentExtension: string | null;
  queueId: number | null;
  queueName: string | null;
  contactName: string | null;
  contactFirstname: string | null;
  contactLastname: string | null;
  accountName: string | null;
}
