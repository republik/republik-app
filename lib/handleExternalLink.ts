import { Alert, Linking, Platform } from "react-native";
import ExternalLinkModule from "@/modules/external-link";

const SHOP_URL = "https://shop.republik.ch";

// Function to handle the external link flow
export const handleExternalLink = async () => {
  if (Platform.OS === "android") {
    await Linking.openURL(SHOP_URL);
    return;
  }

  try {
    // 1. Check if payments are generally possible (required by Apple before proceeding)
    const canMakePayments = await ExternalLinkModule.checkCanMakePayments();
    if (!canMakePayments) {
      Alert.alert("Sie können diese Funktion nicht nutzen.");
      console.warn(
        "ExternalLinkModule.checkCanMakePayments returned false"
      );
      return; // Stop execution if payments can't be made
    }

    // 2. If payments are possible, check if the specific external link can be opened
    const canOpen = await ExternalLinkModule.canOpenExternalLinkHelper();
    if (canOpen) {
      // 3. Open the external link
      const opened = await ExternalLinkModule.openExternalLinkHelper();
      if (!opened) {
        console.warn(
          "ExternalLinkModule.openExternalLinkHelper returned false (e.g., user cancelled)"
        );
      }
    } else {
      console.warn(
        "ExternalLinkModule.canOpenExternalLinkHelper returned false"
      );
    }
  } catch (error) {
    console.error("Error using ExternalLinkModule:", error);
    //Show a generic error alert to the user
    Alert.alert("Fehler", "Ein unerwarteter Fehler ist aufgetreten.");
  }
}; 