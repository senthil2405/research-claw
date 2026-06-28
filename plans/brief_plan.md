Name: Research Claw

** Tool Idea: **

To make a tool that allows users to read research papers in it and if anypart of the research paper is not understandable users should be able to select the text that they dont understand or ask a general qns about the paper without any selections, and they should be able to select the text and be able to ask qns about the selected text to claude and get back the answer and the chat must be stored as a bookmark within the annotated pdf that they can come and revisit.

**Frontend:**

The entire UI is going to be a replica of the UI of claude.ai/new

now if i break down the skeleton of claudes ui we have a sidebar, and a main chat window

We would have a similar skeleton with just 2 components 1 sidebar and one main window only difference insted of a chat window we will have a pdf rendering UI

a. Render Window
The UI should start with a pdf drag and drop upload fucntionality and once user uploads a pdf it should then show up the pdf rendering screen

We should have a UI with pdf renderer and all standard buttons and functionalities that chromes pdf viewer contains

now alongwith when user selects a text line or paragraph using his cursor a tool bar shud pop up just above the selection where we get options and the first option should be a chat icon which when clicked should pop up a small window overlayed over the main pdf screen. more details about the window ill give below 


b. claude overlay window:

it should be a floating screen on top of the main pdf renderer and it should have close button to close the window 

and when a window is created and atleast 1 chat is made for that window then when the user closes the window it should minimize into a small icon near the higlighted text and when user hovers on the icon the text should be higlighted indicating the user what text has been used within the window

Make sure you make a very simplistic neat and clutterfree UI, and yiu can take design inspirations from ppular minimalistic sites

c. Sidebar

Let it have all typical subcomponents of the sidebar that claude has
newchat button, 
all previous chats section where when clicking on each chat it goes to that particular pdfs render

below it there should be a user icon and a claude login button through which the user can login into claude 

a. Claude login button
we should redirect the user to claude login when the user tries to click on the chat icon or when he clicks on the claude login button on the side bar

** Backend **

Now ill describe how the backend flow will look like for a single user and then lets try to design the backend to also efficiently store and retrieve historical user data through logins stored sessions etc, for now dont worrying about managing user sessions let it create a new session everytime an user opens the webapp url


For a single user
When a user opens the webapp 
