import * as FileSystem from "expo-file-system";
import { Share } from "react-native";

export const downloadFile = async (downloadUrl: string) => {
  try {
    // Get the filename from the URL
    const filename = downloadUrl.split("/").pop();
    if (!filename) {
      throw new Error("Could not determine filename from URL");
    }
    // Create a path in the cache directory
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    // Download the file
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      {},
      (downloadProgress) => {
        const progress =
          downloadProgress.totalBytesWritten /
          downloadProgress.totalBytesExpectedToWrite;
        console.log(`Download progress: ${Math.round(progress * 100)}%`);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result) {
      throw new Error("Download failed");
    }
    console.log("File downloaded to:", result.uri);

    // Share the downloaded file
    await Share.share({
      url: result.uri,
      title: filename,
    });
  } catch (error) {
    console.error("Error downloading file:", error);
    // Optional: Show an alert to the user
    // Alert.alert("Download Error", "Could not download or share the file.");
  }
}; 