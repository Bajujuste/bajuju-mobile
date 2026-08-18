import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AddressSuggestion,
  ResolvedAddress,
  createAddressSessionToken,
  resolveAddressSuggestion,
  searchAddressSuggestions,
} from '../lib/addressAutocomplete';

type AddressAutocompleteFieldProps = {
  value: string;
  resolvedAddress: ResolvedAddress | null;
  onValueChange: (value: string) => void;
  onResolvedAddressChange: (value: ResolvedAddress | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
};

function addressErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (message.includes('INCOMPLETE_STREET_ADDRESS')) {
    return 'Seleziona un indirizzo completo di numero civico.';
  }

  if (message.includes('ADDRESS_OUTSIDE_ITALY')) {
    return 'Seleziona un indirizzo in Italia.';
  }

  return 'Non riesco a verificare questo indirizzo. Riprova.';
}

export function AddressAutocompleteField({
  value,
  resolvedAddress,
  onValueChange,
  onResolvedAddressChange,
  label = 'Indirizzo',
  placeholder = 'Es. Via Vittorio Emanuele II 12, Caprino Bergamasco',
  disabled = false,
}: AddressAutocompleteFieldProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const sessionTokenRef = useRef(createAddressSessionToken());
  const requestIdRef = useRef(0);

  useEffect(() => {
    const cleanValue = value.trim();

    if (
      disabled ||
      resolving ||
      resolvedAddress ||
      cleanValue.length < 3
    ) {
      if (cleanValue.length < 3 || resolvedAddress) {
        setSuggestions([]);
      }
      return;
    }

    const requestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      setSearching(true);
      setErrorMessage('');

      try {
        const nextSuggestions = await searchAddressSuggestions(
          cleanValue,
          sessionTokenRef.current
        );

        if (requestId === requestIdRef.current) {
          setSuggestions(nextSuggestions);
        }
      } catch {
        if (requestId === requestIdRef.current) {
          setSuggestions([]);
          setErrorMessage('Non riesco a cercare gli indirizzi. Riprova.');
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setSearching(false);
        }
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [disabled, resolvedAddress, resolving, value]);

  function handleChangeText(nextValue: string) {
    requestIdRef.current += 1;
    onValueChange(nextValue);

    if (resolvedAddress) {
      onResolvedAddressChange(null);
      sessionTokenRef.current = createAddressSessionToken();
    }

    setSuggestions([]);
    setErrorMessage('');
  }

  async function handleSuggestionPress(suggestion: AddressSuggestion) {
    if (disabled || resolving) return;

    setResolving(true);
    setErrorMessage('');

    try {
      const resolved = await resolveAddressSuggestion(
        suggestion.placeId,
        sessionTokenRef.current
      );

      const displayValue =
        resolved.shortFormattedAddress ||
        resolved.formattedAddress ||
        suggestion.description;

      onValueChange(displayValue);
      onResolvedAddressChange(resolved);
      setSuggestions([]);
      sessionTokenRef.current = createAddressSessionToken();
    } catch (error) {
      onResolvedAddressChange(null);
      setErrorMessage(addressErrorMessage(error));
    } finally {
      setResolving(false);
    }
  }

  const busy = searching || resolving;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9c7b8b"
          style={[
            styles.input,
            resolvedAddress ? styles.inputVerified : null,
          ]}
          editable={!disabled && !resolving}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={180}
        />

        {busy ? (
          <ActivityIndicator size="small" style={styles.spinner} />
        ) : null}
      </View>

      {suggestions.length > 0 ? (
        <View style={styles.suggestionsBox}>
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion.placeId}
              onPress={() => handleSuggestionPress(suggestion)}
              style={[
                styles.suggestion,
                index < suggestions.length - 1
                  ? styles.suggestionBorder
                  : null,
              ]}
            >
              <Text style={styles.suggestionMain}>
                {suggestion.mainText || suggestion.description}
              </Text>

              {suggestion.secondaryText ? (
                <Text style={styles.suggestionSecondary}>
                  {suggestion.secondaryText}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {resolvedAddress ? (
        <Text style={styles.verifiedText}>
          Indirizzo verificato: {resolvedAddress.city} ({resolvedAddress.provinceCode || resolvedAddress.province})
        </Text>
      ) : value.trim().length >= 3 && !busy && !errorMessage ? (
        <Text style={styles.helperText}>
          Seleziona uno dei suggerimenti per confermare l&apos;indirizzo.
        </Text>
      ) : null}

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    color: '#6f3855',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    minHeight: 56,
    borderWidth: 2,
    borderColor: '#ffd3e6',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 15,
    paddingRight: 44,
    color: '#4b1430',
    fontSize: 15,
  },
  inputVerified: {
    borderColor: '#7fcf9b',
  },
  spinner: {
    position: 'absolute',
    right: 14,
    top: 18,
  },
  suggestionsBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  suggestion: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f7e2ec',
  },
  suggestionMain: {
    color: '#4b1430',
    fontSize: 14,
    fontWeight: '800',
  },
  suggestionSecondary: {
    marginTop: 3,
    color: '#8f6579',
    fontSize: 12,
    lineHeight: 16,
  },
  helperText: {
    marginTop: 7,
    color: '#8f6579',
    fontSize: 12,
    lineHeight: 17,
  },
  verifiedText: {
    marginTop: 7,
    color: '#287a49',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  errorText: {
    marginTop: 7,
    color: '#b42318',
    fontSize: 12,
    lineHeight: 17,
  },
});
