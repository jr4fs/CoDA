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
import { LoginUserRequest } from "@common/types/accounts";
import { loginUser } from "../services/account.service";
import { getClientConfig } from "../services/config.service";
import { AxiosError } from "axios";
import { useDispatch } from "react-redux";
import { setUser } from "../store/userSlice";
import { PilotBanner } from "../components/PilotBanner";

const isPilot = import.meta.env.VITE_APP_MODE === "pilot";

export default function LoginPage() {
  const navigate = useNavigate();
  const { colorScheme } = useMantineColorScheme();
  const isLight = colorScheme === "light";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupAllowed, setSignupAllowed] = useState(false);

  useEffect(() => {
    getClientConfig()
      .then((cfg) => setSignupAllowed(cfg.allowSignup))
      .catch(() => setSignupAllowed(false));
  }, []);
  const dispatch = useDispatch();

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      email: "",
      password: "",
      rememberMe: true,
    },
    onSubmitPreventDefault: "always",
    validate: {
      email: (value: string) =>
        /^\S+@\S+\.\S+$/.test(value) ? null : "Invalid email",
      password: (value: string) =>
        value.length >= 8 ? null : "Must be at least 8 characters",
    },
  });

  const handleSubmit = async (values: LoginUserRequest) => {
    setLoading(true);
    setError("");
    try {
      const res = await loginUser(values);
      dispatch(
        setUser({
          user: res.user,
          accessToken: res.jwtToken,
          refreshToken: res.jwtRefreshToken,
        }),
      );
      setLoading(false);
      navigate("/home");
    } catch (error) {
      if (error instanceof AxiosError) {
        const errorMessage = error?.response?.data?.message || error?.message;

        setError(errorMessage);
      } else {
        setError("Login Failed. Internal Server Error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    {isPilot && <PilotBanner />}
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
              Welcome back
            </Text>
            {error.length > 0 && (
              <Alert
                variant="light"
                color="red"
                title={error}
                icon={<IconExclamationMark />}
              />
            )}
            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="lg">
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
                  >
                    Login
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
            {signupAllowed && (
              <Box>
                <Text ta="center">
                  Don't have an account?{" "}
                  <Anchor component={Link} to="/signup" c="#50C878">
                    Sign Up
                  </Anchor>
                </Text>
              </Box>
            )}
          </Stack>
        </Paper>
      </Center>
    </BackgroundImage>
    </>
  );
}
