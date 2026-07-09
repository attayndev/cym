import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { canTrackMore } from '@/lib/tier';
import { Field } from '@/components/field';
import { Body, Button, Chip, Eyebrow, Heading, Row, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { addDays, isoDate } from '@/lib/dates';
import { markSubmission } from '@/lib/share';
import type { Category, Importance } from '@/lib/types';
import { useApp } from '@/state/app-context';

const CATEGORIES: Category[] = [
  'professional',
  'friend',
  'family',
  'mentor',
  'client',
  'other',
];

const SUGGESTED_CADENCE: Record<Category, number> = {
  family: 14,
  friend: 30,
  professional: 60,
  mentor: 60,
  client: 30,
  other: 90,
};

const CADENCES = [7, 14, 30, 60, 90, 180];

const DUE_OPTIONS = [
  { key: 'capture.due.tomorrow' as const, days: 1 },
  { key: 'capture.due.in3days' as const, days: 3 },
  { key: 'capture.due.nextWeek' as const, days: 7 },
];

type CaptureParams = Partial<
  Record<
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'phone'
    | 'company'
    | 'role'
    | 'note'
    | 'source'
    | 'submissionId',
    string
  >
>;

export default function CaptureScreen() {
  const { db, captureContact } = useApp();
  const router = useRouter();
  const { t } = useTranslation();
  // An accepted exchange submission arrives prefilled through route params.
  const params = useLocalSearchParams<CaptureParams>();
  const [step, setStep] = useState(0);

  const [firstName, setFirstName] = useState(params.firstName ?? '');
  const [lastName, setLastName] = useState(params.lastName ?? '');
  const [email, setEmail] = useState(params.email ?? '');
  const [phone, setPhone] = useState(params.phone ?? '');
  const [company, setCompany] = useState(params.company ?? '');
  const [role, setRole] = useState(params.role ?? '');
  const [birthday, setBirthday] = useState('');

  const [whereMet, setWhereMet] = useState('');
  const [discussed, setDiscussed] = useState(params.note ?? '');
  const [whyMatters, setWhyMatters] = useState('');
  const [commitment, setCommitment] = useState('');
  const [dueDays, setDueDays] = useState<number | null>(null);

  const [category, setCategory] = useState<Category>('professional');
  const [importance, setImportance] = useState<Importance>(2);
  const [cadenceDays, setCadenceDays] = useState<number | null>(null);

  const effectiveCadence = cadenceDays ?? SUGGESTED_CADENCE[category];

  const cadenceLabel = (days: number) =>
    days < 30
      ? t('cadence.days', { n: days })
      : days === 30
        ? t('cadence.month')
        : days === 60
          ? t('cadence.2months')
          : days === 90
            ? t('cadence.quarter')
            : t('cadence.6months');

  const save = () => {
    if (db && !canTrackMore(db)) {
      router.push('/paywall');
      return;
    }
    const contactId = captureContact({
      firstName,
      lastName,
      email,
      phone,
      company,
      role,
      birthday: /^\d{2}-\d{2}$/.test(birthday) ? birthday : undefined,
      category,
      importance,
      cadenceDays: effectiveCadence,
      whereMet,
      discussed,
      whyMatters,
      commitment,
      commitmentDueAt:
        commitment.trim() && dueDays !== null
          ? isoDate(addDays(new Date(), dueDays))
          : undefined,
      source: params.source === 'qr' ? 'qr' : undefined,
    });
    if (params.submissionId) void markSubmission(params.submissionId, 'accepted');
    router.dismiss();
    router.push(`/contact/${contactId}`);
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="x" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        <View style={{ width: 22 }} />
      </View>

      {step === 0 && (
        <>
          <Heading>{t('capture.step0.title')}</Heading>
          <Field
            label={t('field.firstName')}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            placeholder="Maya"
          />
          <Field
            label={t('field.lastName')}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
          />
          <Field
            label={t('field.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label={t('field.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Field
            label={t('field.company')}
            value={company}
            onChangeText={setCompany}
            autoCapitalize="words"
          />
          <Field
            label={t('field.role')}
            value={role}
            onChangeText={setRole}
            autoCapitalize="words"
          />
          <Field
            label={t('field.birthday')}
            value={birthday}
            onChangeText={setBirthday}
            placeholder="06-14"
          />
          <Button
            title={t('capture.next.context')}
            onPress={() => setStep(1)}
            disabled={!firstName.trim()}
          />
        </>
      )}

      {step === 1 && (
        <>
          <Heading>{t('capture.step1.title')}</Heading>
          <Body muted>{t('capture.step1.body')}</Body>
          <Field
            label={t('capture.field.whereMet')}
            value={whereMet}
            onChangeText={setWhereMet}
            placeholder={t('capture.field.whereMet.ph')}
          />
          <Field
            label={t('capture.field.discussed')}
            value={discussed}
            onChangeText={setDiscussed}
            multiline
          />
          <Field
            label={t('capture.field.whyMatters')}
            value={whyMatters}
            onChangeText={setWhyMatters}
            multiline
          />
          <Field
            label={t('capture.field.commitment')}
            value={commitment}
            onChangeText={setCommitment}
            placeholder={t('capture.field.commitment.ph')}
          />
          {commitment.trim() !== '' && (
            <View style={{ gap: 8 }}>
              <Eyebrow>{t('capture.due.label')}</Eyebrow>
              <Row>
                {DUE_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.days}
                    label={t(opt.key)}
                    selected={dueDays === opt.days}
                    onPress={() => setDueDays(opt.days)}
                  />
                ))}
              </Row>
            </View>
          )}
          <Button title={t('capture.next.keep')} onPress={() => setStep(2)} />
          <Button title={t('common.back')} variant="ghost" onPress={() => setStep(0)} />
        </>
      )}

      {step === 2 && (
        <>
          <Heading>{t('capture.step2.title')}</Heading>
          <View style={{ gap: 8 }}>
            <Eyebrow>{t('capture.category.label')}</Eyebrow>
            <Row>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={t(`category.${c}`)}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </Row>
          </View>
          <View style={{ gap: 8 }}>
            <Eyebrow>{t('capture.importance.label')}</Eyebrow>
            <Row>
              {([1, 2, 3] as Importance[]).map((i) => (
                <Chip
                  key={i}
                  label={t(`importance.${i}`)}
                  selected={importance === i}
                  onPress={() => setImportance(i)}
                />
              ))}
            </Row>
          </View>
          <View style={{ gap: 8 }}>
            <Eyebrow>{t('capture.cadence.label')}</Eyebrow>
            <Row>
              {CADENCES.map((days) => (
                <Chip
                  key={days}
                  label={cadenceLabel(days)}
                  selected={effectiveCadence === days}
                  onPress={() => setCadenceDays(days)}
                />
              ))}
            </Row>
            <Text style={styles.suggestion}>
              {t('capture.cadence.suggestion', {
                category: t(`category.${category}`),
                n: SUGGESTED_CADENCE[category],
              })}
            </Text>
          </View>
          <Button title={t('capture.save')} onPress={save} />
          <Button title={t('common.back')} variant="ghost" onPress={() => setStep(1)} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.blush,
  },
  dotActive: {
    backgroundColor: colors.ink,
  },
  suggestion: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.muted,
  },
});
