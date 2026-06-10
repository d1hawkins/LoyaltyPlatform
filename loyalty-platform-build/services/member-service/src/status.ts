import type { MemberStatus } from '@loyalty/shared-types';

const TRANSITIONS: Record<MemberStatus, MemberStatus[]> = {
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [], // terminal
};

export function canTransition(from: MemberStatus, to: MemberStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}
