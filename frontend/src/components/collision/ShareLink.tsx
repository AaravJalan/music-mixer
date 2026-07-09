import { useState } from 'react';
import { motion } from 'framer-motion';
import type { UserProfile } from '@music-mixer/shared';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Avatar } from '../ui/Avatar';

interface ShareLinkProps {
  shareUrl: string;
  user: UserProfile;
}

export function ShareLink({ shareUrl, user }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card glow="purple" className="max-w-lg mx-auto text-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex justify-center mb-4">
          <Avatar user={user} size="lg" ring />
        </div>
        <h2 className="text-2xl font-bold mb-2">You're in, {user.displayName.split(' ')[0]}!</h2>
        <p className="text-white/60 mb-6">
          Share this link with a friend. Once they join, we'll collide your tastes and build a playlist.
        </p>

        <div className="flex items-center gap-2 p-3 rounded-xl bg-black/30 mb-4">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 bg-transparent text-sm text-white/70 outline-none truncate"
          />
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <div className="flex items-center justify-center gap-3 text-white/40 text-sm">
          <div className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" />
          Waiting for your taste twin...
        </div>
      </motion.div>
    </Card>
  );
}
