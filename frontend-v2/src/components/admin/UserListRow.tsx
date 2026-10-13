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
 *         noname@example.com           10 credits
 */
export function UserListRow({ user, onOpen }: UserListRowProps) {
    return (
        <AdminRow
            onClick={() => onOpen(user)}
            leading={<UserAvatar email={user.email} nickname={user.nickname} avatarUrl={user.avatar_url} />}
            title={userName(user)}
            stamps={<UserTierStamps user={user} />}
            subtitle={user.email}
            trailing={
                <>
                    <UserStatusStamp user={user} />
                    {/* An invited address has no balance yet: nothing to print, not a zero. */}
                    {user.credits_balance != null && (
                        <span className="num text-xs leading-none text-muted-foreground">
                            <span>{user.credits_balance.toLocaleString()}</span> credits
                        </span>
                    )}
                </>
            }
        />
    );
}
