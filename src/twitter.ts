import inquirer from "inquirer";
import { Scraper } from "agent-twitter-client";

interface Config {
  rawdata?: {
    apiKey?: string;
  };
  socialNetworks?: {
    xcom?: {
      xcomSession?: string;
    };
  };
}

const scraper = new Scraper();

const promptUserCredentials = async () => {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "username",
      message: "Twitter username:",
      validate: (input: string) => input.trim() !== "" || "Username is required",
    },
    {
      type: "password",
      name: "password",
      message: "Twitter password:",
      validate: (input: string) => input.trim() !== "" || "Password is required",
    },
    {
      type: "input",
      name: "email",
      message: "Twitter email (leave blank if email confirmation is not enabled):",
    },
    {
      type: "password",
      name: "twoFactorSecret",
      message: "Twitter 2FA secret (leave blank if not enabled):",
    },
  ]);

  return answers;
};

const tryLoginWithCookies = async (twitterSession: string): Promise<boolean> => {
  try {
    console.log("🐦 Attempting to login with stored Twitter cookies...");
    
    // Decode the base64 session data
    const cookieStrings = JSON.parse(Buffer.from(twitterSession, "base64").toString());
    
    // Set cookies in the scraper
    await scraper.setCookies(cookieStrings);
    
    // Test if we're logged in by trying to get account info
    const isLoggedIn = await scraper.isLoggedIn();
    
    if (isLoggedIn) {
      console.log("✅ Successfully logged in to Twitter with stored cookies!");
      return true;
    } else {
      console.log("❌ Stored Twitter cookies are invalid or expired");
      return false;
    }
  } catch (error) {
    console.log("❌ Failed to login with stored Twitter cookies:", error instanceof Error ? error.message : String(error));
    return false;
  }
};

const performFullTwitterLogin = async (): Promise<string> => {
  console.log("🐦 Performing full Twitter login...");
  
  const credentials = await promptUserCredentials();
  const { username, password, email, twoFactorSecret } = credentials;

  console.log("Logging in to Twitter...");
  await scraper.login(
    username,
    password,
    email || undefined,
    twoFactorSecret || undefined
  );

  // Get cookies and encode them
  const cookies = await scraper.getCookies();
  const twitterSession = Buffer.from(
    JSON.stringify(cookies.map((cookie: any) => cookie.toString()))
  ).toString("base64");

  console.log("✅ Successfully logged in to Twitter!");
  return twitterSession;
};

export const handleTwitterLogin = async (
  config: Config,
  saveConfig: (config: Config) => void
): Promise<void> => {
  try {
    console.log("\n🐦 Starting Twitter authentication...");
    
    let loginSuccessful = false;
    
    if (config.socialNetworks?.xcom?.xcomSession) {
      loginSuccessful = await tryLoginWithCookies(config.socialNetworks.xcom.xcomSession);
    } else {
      console.log("No stored Twitter cookies found.");
    }

    // If cookie login failed, perform full login
    if (!loginSuccessful) {
      console.log("\nPerforming fresh Twitter login...");
      const twitterSession = await performFullTwitterLogin();
      
      // Save to config
      if (!config.socialNetworks) {
        config.socialNetworks = {};
      }
      if (!config.socialNetworks.xcom) {
        config.socialNetworks.xcom = {};
      }
      config.socialNetworks.xcom.xcomSession = twitterSession;
      saveConfig(config);
    }

    console.log("🎉 Twitter authentication complete!");
    
    // You can add Twitter-specific functionality here
    const isLoggedIn = await scraper.isLoggedIn();
    console.log(`Twitter status: ${isLoggedIn ? "✅ Logged in" : "❌ Not logged in"}`);
    
  } catch (error: unknown) {
    console.error(
      "❌ Error during Twitter authentication:",
      error instanceof Error ? error.message : String(error)
    );
  }
};

export { scraper }; 