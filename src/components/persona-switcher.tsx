import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Eyebrow } from '@/components/ui';
import { colors, fonts, shadows } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { useApp } from '@/state/app-context';

/** Header pill for flipping between personas. Renders nothing while there is
 *  only one persona, so single-persona users never see it. */
export function PersonaSwitcher() {
  const { db, activePersonaId, setActivePersona } = useApp();
  const router = useRouter();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!db || db.personas.length < 2) return null;
  const active = db.personas.find((p) => p.id === activePersonaId);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}>
        <Feather name="user" size={12} color={colors.inkSoft} />
        <Text style={styles.pillText} numberOfLines={1}>
          {active?.name ?? ''}
        </Text>
        <Feather name="chevron-down" size={13} color={colors.inkSoft} />
      </Pressable>

      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Eyebrow>{t('persona.switcher.title')}</Eyebrow>
            {db.personas.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  setActivePersona(p.id);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={styles.rowName}>{p.name}</Text>
                  {p.tagline ? <Text style={styles.rowTagline}>{p.tagline}</Text> : null}
                </View>
                {p.id === activePersonaId && (
                  <Feather name="check" size={16} color={colors.cherryDeep} />
                )}
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                setOpen(false);
                router.push('/personas');
              }}
              style={({ pressed }) => [styles.manageRow, pressed && { opacity: 0.7 }]}>
              <Feather name="sliders" size={13} color={colors.inkSoft} />
              <Text style={styles.manageText}>{t('persona.switcher.manage')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    maxWidth: 160,
  },
  pillText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.inkSoft,
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(59,36,28,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...shadows.card,
    padding: 18,
    gap: 4,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowName: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  rowTagline: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.muted,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: 12,
  },
  manageText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.inkSoft,
  },
});
