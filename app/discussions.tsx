'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, MessageSquare, Pin, Plus, Send } from 'lucide-react';
import { Data, Row } from '@/lib/lms/types';
import { Badge, PageTitle } from './portal-ui';
import './discussions.css';

type DiscussionAction = (body: Row, message?: string) => Promise<any>;

const when = (value: string) =>
  new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
const initials = (name = '') =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase() || '?';

export function Discussions({
  data,
  user,
  run,
}: {
  data: Data;
  user: Row;
  run: DiscussionAction;
}) {
  const [offeringId, setOfferingId] = useState('');
  const [threadId, setThreadId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const offerings = (data.offerings || []).filter((offering) => {
    if (offering.active === 0) return false;
    if (user.role === 'TEACHER')
      return offering.teacherId === user.id || offering.coTeacherId === user.id;
    if (user.role === 'STUDENT')
      return (
        offering.batchId === user.batchId ||
        (data.enrollments || []).some(
          (enrollment) =>
            enrollment.studentId === user.id &&
            enrollment.offeringId === offering.id &&
            enrollment.active !== 0,
        )
      );
    if (user.role === 'HOD')
      return data.batches?.some(
        (batch) => batch.id === offering.batchId && batch.departmentId === user.departmentId,
      );
    return true;
  });
  const allowedOfferingIds = new Set(offerings.map((item) => item.id));
  const discussionThreads = (data.discussionThreads || []).filter((thread) =>
    allowedOfferingIds.has(thread.offeringId),
  );
  const visibleThreadIds = new Set(discussionThreads.map((thread) => thread.id));
  const discussionPosts = (data.discussionPosts || []).filter((post) =>
    visibleThreadIds.has(post.threadId),
  );
  const offering = offerings.find((item) => item.id === offeringId);
  const threads = useMemo(
    () =>
      discussionThreads
        .filter((thread) => thread.offeringId === offeringId)
        .slice()
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
        ),
    [data.discussionThreads, offeringId, offerings],
  );
  const selectedThread = threads.find((thread) => thread.id === threadId);
  const posts = discussionPosts
    .filter((post) => post.threadId === selectedThread?.id)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const userById = (id: string) => data.users?.find((item) => item.id === id);
  const subjectName = (id?: string) =>
    data.subjects?.find((subject) => subject.id === id)?.name || 'Subject';
  const batchName = (id?: string) =>
    data.batches?.find((batch) => batch.id === id)?.name || 'Class';
  const isTeacher = ['TEACHER', 'HOD'].includes(user.role);
  const canModerate = !!offering && isTeacher && [offering.teacherId, offering.coTeacherId].includes(user.id);
  const canDeleteThread =
    !!selectedThread && (canModerate || selectedThread.authorId === user.id);

  const submitThread = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!offeringId) return;
    setSending(true);
    setError('');
    try {
      const result = await run(
        { action: 'discussionCreateThread', offeringId, title, body },
        'Discussion started',
      );
      setTitle('');
      setBody('');
      setCreateOpen(false);
      setThreadId(result.id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSending(false);
    }
  };

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedThread) return;
    setSending(true);
    setError('');
    try {
      await run({ action: 'discussionReply', threadId: selectedThread.id, body: reply }, 'Reply posted');
      setReply('');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSending(false);
    }
  };

  const toggleModeration = async (field: 'pinned' | 'locked') => {
    if (!selectedThread) return;
    setError('');
    try {
      await run(
        {
          action: 'discussionModerate',
          threadId: selectedThread.id,
          pinned: field === 'pinned' ? !selectedThread.pinned : !!selectedThread.pinned,
          locked: field === 'locked' ? !selectedThread.locked : !!selectedThread.locked,
        },
        field === 'pinned'
          ? selectedThread.pinned
            ? 'Discussion unpinned'
            : 'Discussion pinned'
          : selectedThread.locked
            ? 'Replies reopened'
            : 'Discussion locked',
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const deleteThread = async () => {
    if (!selectedThread || !window.confirm('Delete this discussion and all its replies?')) return;
    setError('');
    try {
      await run({ action: 'discussionDeleteThread', threadId: selectedThread.id }, 'Discussion deleted');
      setThreadId('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const deletePost = async (post: Row) => {
    if (!selectedThread || !window.confirm('Delete this reply?')) return;
    setError('');
    try {
      await run(
        { action: 'discussionDeletePost', threadId: selectedThread.id, postId: post.id },
        'Reply deleted',
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const startThreadFor = (id: string) => {
    setOfferingId(id);
    setThreadId('');
    setCreateOpen(true);
    setError('');
  };

  return (
    <div className="discussion-page">
      <PageTitle
        title="Discussion boards"
        text={
          isTeacher
            ? 'Follow subject conversations, answer questions and guide class discussions.'
            : 'Choose a subject to ask questions, share ideas and learn with your class.'
        }
      />

      {!offering ? (
        <section className="discussion-subjects panel">
          <div className="discussion-intro">
            <span className="discussion-intro-icon"><MessageSquare size={20} /></span>
            <div>
              <h2>{isTeacher ? 'Your subject boards' : 'Choose a subject'}</h2>
              <p>
                {isTeacher
                  ? 'Each board is organized by subject and class, so conversations stay in the right place.'
                  : 'Select the class subject where you want to read or start a discussion.'}
              </p>
            </div>
          </div>
          {offerings.length ? (
            <div className="discussion-subject-grid">
              {offerings.map((item) => {
                const count = discussionThreads.filter(
                  (thread) => thread.offeringId === item.id,
                ).length;
                const replies = discussionPosts.filter((post) =>
                  discussionThreads.some(
                    (thread) => thread.id === post.threadId && thread.offeringId === item.id,
                  ),
                ).length;
                return (
                  <button
                    className="discussion-subject-card"
                    key={item.id}
                    onClick={() => {
                      setOfferingId(item.id);
                      setThreadId('');
                    }}
                  >
                    <span className="discussion-subject-icon"><MessageSquare size={18} /></span>
                    <span className="discussion-subject-name">{subjectName(item.subjectId)}</span>
                    <span className="discussion-subject-class">{batchName(item.batchId)}</span>
                    <span className="discussion-subject-count">
                      {count} {count === 1 ? 'discussion' : 'discussions'}
                      <span> · </span>
                      {replies} {replies === 1 ? 'reply' : 'replies'}
                    </span>
                    <ArrowRight className="discussion-subject-arrow" size={17} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="discussion-empty-subjects">
              <h3>No subject boards are available</h3>
              <p>Your assigned or enrolled subjects will appear here.</p>
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="discussion-board-toolbar">
            <button
              className="btn discussion-back-button"
              onClick={() => {
                setOfferingId('');
                setThreadId('');
                setCreateOpen(false);
              }}
            >
              <ArrowLeft size={16} /> All subject boards
            </button>
            <div className="discussion-board-title">
              <strong>{subjectName(offering.subjectId)}</strong>
              <span>{batchName(offering.batchId)}</span>
            </div>
            <button
              className="btn primary discussion-new-button"
              onClick={() => {
                setThreadId('');
                setCreateOpen(true);
              }}
            >
              <Plus size={17} /> Start discussion
            </button>
          </div>
          <div
            className={
              'discussion-workspace' +
              (selectedThread || createOpen ? ' has-selected-thread' : '')
            }
          >
            <section className="discussion-list panel" aria-label="Discussion topics">
              <div className="discussion-list-heading">
                <div>
                  <h2>Subject discussions</h2>
                  <p>{threads.length} {threads.length === 1 ? 'topic' : 'topics'}</p>
                </div>
                <button
                  className="discussion-icon-button"
                  aria-label="Start a discussion"
                  title="Start a discussion"
                  onClick={() => {
                    setThreadId('');
                    setCreateOpen(true);
                  }}
                >
                  <Plus size={18} />
                </button>
              </div>
              {threads.length ? (
                threads.map((thread) => {
                  const author = userById(thread.authorId);
                  const replies = discussionPosts.filter(
                    (post) => post.threadId === thread.id,
                  ).length;
                  return (
                    <button
                      key={thread.id}
                      className={'discussion-topic' + (thread.id === threadId ? ' active' : '')}
                      onClick={() => {
                        setThreadId(thread.id);
                        setCreateOpen(false);
                        setError('');
                      }}
                    >
                      <span className="discussion-topic-topline">
                        <span>{author?.name || 'LCPS member'}</span>
                        <time>{when(thread.updatedAt)}</time>
                      </span>
                      <strong>{thread.title}</strong>
                      <span className="discussion-topic-preview">{thread.body}</span>
                      <span className="discussion-topic-meta">
                        {thread.pinned ? <span><Pin size={13} /> Pinned</span> : null}
                        {thread.locked ? <span><LockKeyhole size={13} /> Closed</span> : null}
                        <span><MessageSquare size={13} /> {replies} {replies === 1 ? 'reply' : 'replies'}</span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="discussion-list-empty">
                  <MessageSquare size={22} />
                  <strong>Start the first discussion</strong>
                  <span>Ask a subject question or share a useful idea with your class.</span>
                  <button className="text-btn" onClick={() => setCreateOpen(true)}>
                    Create a topic <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </section>

            <section className="discussion-detail panel" aria-label="Selected discussion">
              {createOpen ? (
                <form className="discussion-form" onSubmit={submitThread}>
                  <button className="discussion-mobile-back" type="button" onClick={() => setCreateOpen(false)}>
                    <ArrowLeft size={16} /> Back to topics
                  </button>
                  <span className="discussion-form-eyebrow">{subjectName(offering.subjectId)} · {batchName(offering.batchId)}</span>
                  <h2>Start a discussion</h2>
                  <p>Give your class a clear topic and enough detail to start a useful conversation.</p>
                  <label>
                    <span>Topic title</span>
                    <input
                      value={title}
                      maxLength={120}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="What would you like to discuss?"
                      required
                    />
                    <small>{title.length}/120</small>
                  </label>
                  <label>
                    <span>Details</span>
                    <textarea
                      value={body}
                      maxLength={10000}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder="Add context, a question or ideas for your classmates."
                      rows={7}
                      required
                    />
                    <small>Keep the conversation respectful and focused on this subject.</small>
                  </label>
                  {error && <p className="discussion-error" role="alert">{error}</p>}
                  <button className="btn primary discussion-submit" disabled={sending}>
                    <MessageSquare size={16} /> {sending ? 'Posting…' : 'Post discussion'}
                  </button>
                </form>
              ) : selectedThread ? (
                <article className="discussion-thread-view">
                  <button className="discussion-mobile-back" type="button" onClick={() => setThreadId('')}>
                    <ArrowLeft size={16} /> Back to topics
                  </button>
                  <div className="discussion-thread-topline">
                    <div className="discussion-thread-tags">
                      <Badge tone="green">{subjectName(offering.subjectId)}</Badge>
                      <Badge>{batchName(offering.batchId)}</Badge>
                      {selectedThread.pinned ? <Badge tone="amber">Pinned</Badge> : null}
                      {selectedThread.locked ? <Badge tone="red">Replies closed</Badge> : null}
                    </div>
                    {(canModerate || canDeleteThread) && (
                      <div className="discussion-moderator-actions">
                        {canModerate && (
                          <>
                            <button className="btn" onClick={() => void toggleModeration('pinned')}>
                              <Pin size={14} /> {selectedThread.pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button className="btn" onClick={() => void toggleModeration('locked')}>
                              <LockKeyhole size={14} /> {selectedThread.locked ? 'Reopen' : 'Lock'}
                            </button>
                          </>
                        )}
                        {canDeleteThread && (
                          <button className="btn discussion-delete-button" onClick={() => void deleteThread()}>
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <h2 className="discussion-thread-title">{selectedThread.title}</h2>
                  <div className="discussion-author-line">
                    <span className="discussion-avatar">{initials(userById(selectedThread.authorId)?.name)}</span>
                    <span><strong>{userById(selectedThread.authorId)?.name || 'LCPS member'}</strong><small>{when(selectedThread.createdAt)}</small></span>
                  </div>
                  <p className="discussion-thread-body">{selectedThread.body}</p>
                  <div className="discussion-replies-heading">
                    <h3>Replies</h3>
                    <span>{posts.length}</span>
                  </div>
                  <div className="discussion-replies">
                    {posts.map((post) => {
                      const author = userById(post.authorId);
                      const canDelete = canModerate || post.authorId === user.id;
                      return (
                        <div className="discussion-reply" key={post.id}>
                          <span className="discussion-avatar">{initials(author?.name)}</span>
                          <div className="discussion-reply-content">
                            <div className="discussion-reply-byline">
                              <strong>{author?.name || 'LCPS member'}</strong>
                              <time>{when(post.createdAt)}</time>
                            </div>
                            <p>{post.body}</p>
                            {canDelete && (
                              <button className="discussion-inline-delete" onClick={() => void deletePost(post)}>
                                Remove reply
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {!posts.length && <p className="discussion-no-replies">No replies yet. Add the first response below.</p>}
                  </div>
                  {selectedThread.locked ? (
                    <div className="discussion-locked-note"><LockKeyhole size={16} /> The teacher has closed replies for this topic.</div>
                  ) : (
                    <form className="discussion-reply-form" onSubmit={submitReply}>
                      <label htmlFor="discussion-reply">Add to the conversation</label>
                      <textarea
                        id="discussion-reply"
                        value={reply}
                        maxLength={5000}
                        onChange={(event) => setReply(event.target.value)}
                        placeholder="Write a thoughtful reply…"
                        rows={3}
                        required
                      />
                      {error && <p className="discussion-error" role="alert">{error}</p>}
                      <div className="discussion-reply-submit-row">
                        <small>{reply.length}/5000</small>
                        <button className="btn primary" disabled={sending}>
                          <Send size={15} /> {sending ? 'Sending…' : 'Reply'}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              ) : (
                <div className="discussion-detail-empty">
                  <span><MessageSquare size={25} /></span>
                  <h2>{threads.length ? 'Choose a discussion' : 'Your subject board is ready'}</h2>
                  <p>
                    {threads.length
                      ? 'Select a topic to read the conversation and add a reply.'
                      : 'Start a topic to ask a question or share an idea with this class.'}
                  </p>
                  {!threads.length && (
                    <button className="btn primary" onClick={() => setCreateOpen(true)}>
                      <Plus size={16} /> Start discussion
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
