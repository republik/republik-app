import { Paths, File } from "expo-file-system";
import { Share } from "react-native";

export const downloadFile = async (downloadUrl: string) => {
  try {
    // Get the filename from the URL
    const filename = downloadUrl.split("/").pop();
    if (!filename) {
      throw new Error("Could not determine filename from URL");
    }

    // Download the file using the new expo-file-system API
    const downloadedFile = await File.downloadFileAsync(
      downloadUrl,
      Paths.cache
    );

    console.log("File downloaded to:", downloadedFile.uri);

    // Share the downloaded file
    await Share.share({
      url: downloadedFile.uri,
      title: filename,
    });
  } catch (error) {
    console.error("Error downloading file:", error);
  }
}; 