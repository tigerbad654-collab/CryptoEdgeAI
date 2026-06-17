import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type CryptoCardProps = {
  title: string;
  value: string;
};

export default function CryptoCard({
  title,
  value,
}: CryptoCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E293B',
    padding: 20,
    borderRadius: 16,
    marginBottom: 15,
  },

  title: {
    color: '#94A3B8',
    marginBottom: 10,
    fontSize: 14,
  },

  value: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
});