import { formatDateTime, formatTimeAgo } from '../../lib/datetime';
import { AdminRow, UserAvatar, UserStatusStamp, UserTierStamps } from './admin-ui';
import { userName, type AdminUser } from './model';

interface UserListRowProps {
    user: AdminUser;
    /** Opens the user's sheet, where every action lives. */
    onOpen: (user: AdminUser) => void;
}

/**
 * A user as one compact row — the phone view of the Users tab.
 *
 *   (NO)  noname [PRO]                     ACTIVE
 *         noname@example.com
 *         10 credits · seen 3d ago
 */
export function UserListRow({ user, onOpen }: UserListRowProps) {
    return (
        <AdminRow
            onClick={() => onOpen(user)}
            leading={<UserAvatar email={user.email} nickname={user.nickname} avatarUrl={user.avatar_url} />}
            title={userName(user)}
            stamps={<UserTierStamps user={user} />}
            subtitle={user.email}
            meta={
                <>
                    {/* An invited address has no balance yet: nothing to print, not a zero. */}
                    {user.credits_balance != null && (
                        <>
                            <span className="num">
                                <span>{user.credits_balance.toLocaleString()}</span> credits
                            </span>
                            <span aria-hidden>·</span>
                        </>
                    )}
                    <span className="num" title={user.last_login ? formatDateTime(user.last_login) : undefined}>
                        {user.last_login ? `seen ${formatTimeAgo(user.last_login)}` : 'never signed in'}
                    </span>
                </>
            }
            trailing={<UserStatusStamp user={user} />}
        />
    );
}
