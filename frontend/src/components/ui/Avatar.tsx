import type { UserProfile } from '@music-mixer/shared';

interface AvatarProps {
  user: UserProfile;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  ring?: boolean;
}

const sizes = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24',
};

export function Avatar({ user, size = 'md', ring = false }: AvatarProps) {
  return (
    <img
      src={user.avatarUrl}
      alt={user.displayName}
      className={`${sizes[size]} rounded-full object-cover ${ring ? 'ring-2 ring-accent-purple ring-offset-2 ring-offset-surface' : ''}`}
    />
  );
}
