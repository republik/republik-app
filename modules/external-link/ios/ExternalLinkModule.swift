import ExpoModulesCore
import StoreKit

public class ExternalLinkModule: Module {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('ExternalLink')` in JavaScript.
    Name("ExternalLink")

    // Function specifically to check SKPaymentQueue.canMakePayments()
    // Needed before showing the interstitial modal as per Apple docs.
    AsyncFunction("checkCanMakePayments") { (promise: Promise) in
        let canPay = SKPaymentQueue.canMakePayments()
        dump("ExternalLinkModule: SKPaymentQueue.canMakePayments() check result: \(canPay)")
        promise.resolve(canPay)
    }

    AsyncFunction("canOpenExternalLinkHelper") {(promise:Promise) in
      Task{
          // this will return false in case the website link is not available in Info.plist
          guard SKPaymentQueue.canMakePayments() else {
              return promise.resolve(false)
          }
          if #available(iOS 16.0, *) {
            if(await ExternalLinkAccount.canOpen){
              return promise.resolve(true)
            }
          }
          return promise.resolve(false)
      }
    }


    AsyncFunction("openExternalLinkHelper") { (promise:Promise) in
      Task{
              if #available(iOS 16.0, *) {
                  do {
                      try await ExternalLinkAccount.open()
                      return promise.resolve(true)
                  } catch {
                      dump("Error - \(error)")
                  }
              } else {
                  return promise.resolve(false)
              }
      }
    }
  }
}