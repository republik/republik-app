import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

const Loader = ({ loading }) => {
  const colorScheme = useColorScheme();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: Colors[colorScheme ?? "light"].default },
      ]}
    >
      <ActivityIndicator
        animating={loading}
        color={Colors[colorScheme ?? "light"].textSoft}
        size="large"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default Loader;
