import {
  TextInput,
  PasswordInput,
  Button,
  Group,
  Center,
  Text,
  Stack,
  Paper,
  BackgroundImage,
  Anchor,
  Box,
  Checkbox,
  Alert,
  useMantineColorScheme,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconExclamationMark } from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { CreateUserRequest } from "@common/types/accounts";
import { createUser, loginUser } from "../services/account.service";
import { getClientConfig } from "../services/config.service";
import { AxiosError } from "axios";
import { useDispatch } from "react-redux";
import { setUser } from "../store/userSlice";
import { toast } from "../lib/toast";

const isValidEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

const getPasswordErrors = (password: string) => {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push("At least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("One uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("One lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("One number");
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("One special character");
  }
  return errors;
};

export default function SignUpPage() {
  const navigate = useNavigate();
  const { colorScheme } = useMantineColorScheme();
  const isLight = colorScheme === "light";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // null = still loading config; drives whether the form is shown at all.
  const [signupAllowed, setSignupAllowed] = useState<boolean | null>(null);
  const dispatch = useDispatch();

  useEffect(() => {
    getClientConfig()
      .then((cfg) => setSignupAllowed(cfg.allowSignup))
      // If the config check fails, fall back to showing the form; the API still
      // enforces the real rule (403) on submit.
      .catch(() => setSignupAllowed(true));
  }, []);

  const form = useForm({
    mode: "controlled",
    initialValues: {
      username: "",
      email: "",
      password: "",
      rememberMe: true,
    },
    onSubmitPreventDefault: "always",
    validateInputOnChange: ["password"],
    validateInputOnBlur: true,
    validate: {
      email: (value: string) => (isValidEmail(value) ? null : "Invalid email"),
      password: (value: string) => {
        const errors = getPasswordErrors(value);
        return errors.length > 0
          ? `Password needs: ${errors.join(", ")}`
          : null;
      },
      username: (value: string) =>
        value.length >= 3 ? null : "Username must be at least 3 characters",
    },
  });

  const passwordErrors = getPasswordErrors(form.values.password);
  const canSubmit =
    form.values.username.length >= 3 &&
    isValidEmail(form.values.email) &&
    passwordErrors.length === 0;

  const handleSubmit = async (values: CreateUserRequest) => {
    setLoading(true);
    setError("");
    try {
      const res = await createUser(values);
      console.log("Created user successfully:", res);
      if (!res.jwtToken || !res.jwtRefreshToken) {
        const loginRes = await loginUser({
          email: values.email,
          password: values.password,
        });
        dispatch(
          setUser({
            user: loginRes.user,
            accessToken: loginRes.jwtToken,
            refreshToken: loginRes.jwtRefreshToken,
          }),
        );
      } else {
        dispatch(
          setUser({
            user: res.user,
            accessToken: res.jwtToken,
            refreshToken: res.jwtRefreshToken,
          }),
        );
      }
      toast.success("Account created successfully");
      navigate("/");
    } catch (error) {
      console.error("Error creating user: ", error);
      if (error instanceof AxiosError) {
        const errorMessage = error?.response?.data?.message || error?.message;
        setError(errorMessage);
      } else {
        setError("Failed creating user. Internal Server Error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <BackgroundImage src="/paint.jpg" radius="xs" w="100vw" h="100vh">
      <Center w="100%" h="100%">
        <Paper
          c={isLight ? "#0f1418" : "white"}
          bg={isLight ? "#ffffff" : "#343434"}
          p="40"
          w="500"
          radius="xl"
          shadow="xl"
        >
          <Stack gap="xl">
            <Text size="32px" fw={900} c="#50C878" ta="center">
              Welcome to the Annotation Tool
            </Text>
            {error.length > 0 && (
              <Alert
                variant="light"
                color="red"
                title={error}
                icon={<IconExclamationMark />}
              />
            )}
            {signupAllowed === false && (
              <Alert
                variant="light"
                color="yellow"
                title="Sign-up is disabled"
                icon={<IconExclamationMark />}
              >
                Self-service registration is turned off for this deployment. Contact an
                administrator to have an account created for you.
              </Alert>
            )}
            {signupAllowed !== false && (
            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="lg">
                <TextInput
                  size="lg"
                  radius="md"
                  withAsterisk
                  label="Username"
                  placeholder="username"
                  key={form.key("username")}
                  {...form.getInputProps("username")}
                />
                <TextInput
                  size="lg"
                  radius="md"
                  withAsterisk
                  label="Email"
                  rightSection="@"
                  placeholder="your@email.com"
                  key={form.key("email")}
                  {...form.getInputProps("email")}
                />
                <PasswordInput
                  size="lg"
                  radius="md"
                  withAsterisk
                  label="Password"
                  placeholder="your password"
                  key={form.key("password")}
                  {...form.getInputProps("password")}
                />
                <Group justify="flex-start" mt="md">
                  <Button
                    bg="#50C878"
                    type="submit"
                    size="lg"
                    fullWidth
                    loading={loading}
                    disabled={!canSubmit}
                  >
                    Sign Up
                  </Button>
                </Group>
                <Checkbox
                  color="#50C878"
                  mt="md"
                  label="Remember me"
                  key={form.key("rememberMe")}
                  {...form.getInputProps("rememberMe", { type: "checkbox" })}
                />
              </Stack>
            </form>
            )}
            <Box>
              <Text ta="center">
                Have an account already?{" "}
                <Anchor component={Link} to="/login" c="#50C878">
                  Login
                </Anchor>
              </Text>
            </Box>
          </Stack>
        </Paper>
      </Center>
    </BackgroundImage>
  );
}
