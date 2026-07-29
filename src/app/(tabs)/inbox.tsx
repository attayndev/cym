import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExchangeRow } from '@/components/exchange-inbox';
import { Body, Card, Chip, Display, Eyebrow, Screen } from '@/components/ui';
import { useTranslation } from '@/i18n';
import {
  listSubmissions,
  markSubmission,
  type ExchangeSubmission,
  type SubmissionStatus,
} from '@/lib/share';
import { adjustPendingCount, refreshPendingCount } from '@/state/exchange-count';
import { useAuth } from '@/state/auth-context';

/**
 * Inbox: everyone who filled in the share-back form on your card's landing
 * page. Pending is the queue — nothing reaches your contacts until you add it
 * here. Added and Dismissed are the record, so a scan is never a silent
 * no-op and a dismissal is never final.
 */

const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const FILTERS: SubmissionStatus[] = ['pending', 'accepted', 'dismissed'];
const FILTER_LABEL = {
  pending: 'inbox.filter.pending',
  accepted: 'inbox.filter.accepted',
  dismissed: 'inbox.filter.dismissed',
} as const;
const EMPTY_TITLE = {
  pending: 'inbox.empty.pending.title',
  accepted: 'inbox.empty.accepted.title',
  dismissed: 'inbox.empty.dismissed.title',
} as const;
const EMPTY_BODY = {
  pending: 'inbox.empty.pending.body',
  accepted: 'inbox.empty.accepted.body',
  dismissed: 'inbox.empty.dismissed.body',
} as const;

export default function InboxScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [rows, setRows] = useState<ExchangeSubmission[]>([]);
  const [filter, setFilter] = useState<SubmissionStatus>('pending');

  const userId = session?.user?.id;
  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setRows([]);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const all = await listSubmissions();
          if (cancelled) return;
          setRows(all);
          void refreshPendingCount();
        } catch {
          // Offline: keep whatever is already on screen.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  const buckets = useMemo(() => {
    const by: Record<SubmissionStatus, ExchangeSubmission[]> = {
      pending: [],
      accepted: [],
      dismissed: [],
    };
    for (const r of rows) by[r.status]?.push(r);
    // listSubmissions returns newest first, which is right for the history
    // buckets. The queue reads oldest first — that's the order they arrived
    // and the order they deserve to be answered in.
    by.pending.reverse();
    return by;
  }, [rows]);

  // Optimistic: the row moves bucket immediately, then the server catches up.
  const move = async (s: ExchangeSubmission, status: SubmissionStatus) => {
    setRows((prev) => prev.map((r) => (r.id === s.id ? { ...r, status } : r)));
    if (s.status === 'pending' && status !== 'pending') adjustPendingCount(-1);
    if (s.status !== 'pending' && status === 'pending') adjustPendingCount(1);
    try {
      await markSubmission(s.id, status);
    } catch {
      // Next focus re-reads the truth from the server.
    }
  };

  const accept = (s: ExchangeSubmission) => {
    // The share-card function validates on the way in, but a submission can
    // outlive a schema/regex change — guard again so a malformed value never
    // reaches capture's prefill. Capture marks it accepted once it saves.
    const birthday = s.birthday && BIRTHDAY_RE.test(s.birthday) ? s.birthday : '';
    router.push({
      pathname: '/capture',
      params: {
        firstName: s.firstName,
        lastName: s.lastName ?? '',
        email: s.email ?? '',
        phone: s.phone ?? '',
        company: s.company ?? '',
        role: s.role ?? '',
        note: s.note ?? '',
        birthday,
        source: 'qr',
        submissionId: s.id,
      },
    });
  };

  const shown = buckets[filter];

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Display>{t('inbox.screen.title')}</Display>
      </View>

      {!userId ? (
        <Card style={{ gap: 6 }}>
          <Eyebrow>{t('inbox.signedOut.title')}</Eyebrow>
          <Body muted>{t('inbox.signedOut.body')}</Body>
        </Card>
      ) : (
        <>
          <View style={styles.filters}>
            {FILTERS.map((f) => (
              <Chip
                key={f}
                label={`${t(FILTER_LABEL[f])}${buckets[f].length ? ` ${buckets[f].length}` : ''}`}
                selected={filter === f}
                onPress={() => setFilter(f)}
              />
            ))}
          </View>

          {shown.length === 0 ? (
            <Card style={{ gap: 6 }}>
              <Eyebrow>{t(EMPTY_TITLE[filter])}</Eyebrow>
              <Body muted>{t(EMPTY_BODY[filter])}</Body>
            </Card>
          ) : (
            <View style={styles.list}>
              {shown.map((s) => (
                <ExchangeRow
                  key={s.id}
                  submission={s}
                  onAccept={s.status === 'pending' ? () => accept(s) : undefined}
                  onDismiss={s.status === 'pending' ? () => void move(s, 'dismissed') : undefined}
                  onRestore={
                    s.status === 'dismissed' ? () => void move(s, 'pending') : undefined
                  }
                />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  list: {
    gap: 10,
  },
});
