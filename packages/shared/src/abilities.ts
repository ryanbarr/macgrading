import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import type { Role } from './domain';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete' | 'grade';
export type Subject = 'Cert' | 'CertPhoto' | 'User' | 'GradeName' | 'Card' | 'all';
export type AppAbility = MongoAbility<[Action, Subject]>;

export function defineAbilityFor(user: { role: Role }): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  can('read', 'Cert');
  can('read', 'Card');
  can('read', 'GradeName');
  can('create', 'Cert');
  can('grade', 'Cert');
  can(['create', 'delete'], 'CertPhoto');

  if (user.role === 'ADMIN') {
    can('manage', 'User');
    can('manage', 'GradeName');
  }

  return build();
}
