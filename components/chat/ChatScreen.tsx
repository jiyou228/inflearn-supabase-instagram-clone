"use client";

import Person from "components/chat/Person";
import Message from "./Message";
import { useRecoilValue } from "recoil";
import {
  presenceState,
  selectedUserIdState,
  selectedUserIndexState,
} from "utils/recoil/atoms";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getUserById } from "actions/chatActions";
import { useEffect, useState, useRef } from "react";
import { Spinner } from "@material-tailwind/react";
import { createBrowserSupabaseClient } from "utils/supabase/client";

export async function sendMesssage({ message, chatUserId }) {
  const supabase = createBrowserSupabaseClient();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session.user) {
    throw new Error("User is not authenticated");
  }

  const { data, error: sendMessageError } = await supabase
    .from("message")
    .insert({
      message,
      receiver: chatUserId,
      //sender: session.user.id,
    });

  if (sendMessageError) {
    throw new Error(sendMessageError.message);
  }
  return data;
}

export async function getAllMessages({ chatUserId }) {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session.user) {
    throw new Error("User is not authenticated");
  }

  const { data, error: getMessagesError } = await supabase
    .from("message")
    .select("*")
    .or(`receiver.eq.${chatUserId},receiver.eq.${session.user.id}`)
    .or(`sender.eq.${chatUserId},sender.eq.${session.user.id}`)
    .order("created_at", { ascending: true });

  if (getMessagesError) {
    return [];
  }
  return data;
}

export default function ChatScreen() {
  const selectedUserId = useRecoilValue(selectedUserIdState);
  const selectedUserIndex = useRecoilValue(selectedUserIndexState);
  const [message, setMessage] = useState("");
  const supabase = createBrowserSupabaseClient();
  const presence = useRecoilValue(presenceState);
  const chatEndRef = useRef(null);
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel("message_postgres_ changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message",
        },
        (payload) => {
          if (payload.eventType === "INSERT" && !payload.errors) {
            getAllMessagesQuery.refetch();
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const selectedUserQuery = useQuery({
    queryKey: ["user", selectedUserId],
    queryFn: () => getUserById(selectedUserId),
  });

  const sendMessageMutation = useMutation<void, unknown, string>({
    mutationFn: async (msg) => {
      await sendMesssage({
        message: msg,
        chatUserId: selectedUserId,
      });
    },
    onSuccess: () => {
      getAllMessagesQuery.refetch();
    },
  });

  const getAllMessagesQuery = useQuery({
    queryKey: ["messages", selectedUserId],
    queryFn: () => getAllMessages({ chatUserId: selectedUserId }),
  });

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [getAllMessagesQuery.data]);

  const handleSendMessage = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage) {
      sendMessageMutation.mutate(trimmedMessage);
      setMessage(""); // 메시지 전송 성공 후에만 입력 초기화
    }
  };

  return selectedUserQuery.data !== null ? (
    <div className="h-screen  w-full flex flex-col">
      {/* Active User 영역 */}
      <Person
        index={selectedUserIndex}
        isActive={false}
        onChatScreen={true}
        name={selectedUserQuery.data?.email?.split("@")[0]}
        onlineAt={presence?.[selectedUserId]?.[0]?.onlineAt}
        userId={selectedUserQuery.data?.id}
      />
      {/* 채팅 영역 */}
      <div className="w-full overflow-y-scroll flex-1 flex flex-col p-4 gap-3">
        {getAllMessagesQuery.data?.map((message) => (
          <Message
            key={message.id}
            message={message.message}
            isFromMe={message.receiver === selectedUserId}
          />
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* 체팅창 영역 */}
      <div className="flex">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            // 한글이나 일본어 입력 중일 때, isComposing이 true로 설정됨
            if (e.key === "Enter" && !isComposing) {
              e.preventDefault(); // 기본 Enter 동작 방지
              handleSendMessage(); // 엔터로 메시지 전송
            }
          }}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          className="p-4 w-full border-2 border-light-blue-600"
          placeholder="메세지를 입력하세요."
        />

        <button
          onClick={handleSendMessage}
          className="min-w-20 p-3 bg-light-blue-700 text-white"
          color="light-blue"
        >
          {sendMessageMutation.isPending ? <Spinner /> : <span>전송</span>}
        </button>
      </div>
    </div>
  ) : (
    <div className="w-full"></div>
  );
}
